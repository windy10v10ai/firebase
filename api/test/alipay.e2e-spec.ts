/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AlipayApiService } from '../src/alipay/alipay.api.service';
import { AlipayProductCode } from '../src/alipay/enums/alipay-product-code.enum';
import { AlipayTradeStatus } from '../src/alipay/enums/alipay-trade-status.enum';
import { AppModule } from '../src/app.module';
import { MemberLevel } from '../src/members/entities/members.entity';
import { AppGlobalSettings } from '../src/util/settings';

import { createPlayer, getMemberDto, getPlayer } from './util/util-player';

/**
 * Alipay e2e：
 *   - mock 整个 AlipayApiService（precreate 不走外网，verifyNotifySign 由测试控制开关）
 *   - 其余链路（Firestore emulator / Members / Player / Analytics）保持真实
 *   - GA4 sendEvent 走真实代码但不会真发外网，断言落到「调用了 alipayPurchase」即可
 */
describe('AlipayController (e2e)', () => {
  let app: INestApplication;
  const prefixPath = '/api/alipay';

  // 让测试可控的 mock：默认验签通过，单独 case 可设 false 模拟伪造
  let signValid = true;
  const precreateMock = jest.fn(async () => 'https://qr.alipay.com/mock-' + Date.now());
  const verifyMock = jest.fn(() => signValid);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AlipayApiService)
      .useValue({ precreate: precreateMock, verifyNotifySign: verifyMock })
      .compile();

    app = moduleFixture.createNestApplication();
    AppGlobalSettings(app);
    await app.init();

    await createPlayer(app, { steamId: 300010001 });
    await createPlayer(app, { steamId: 300010002 });
    await createPlayer(app, { steamId: 300010003 });
    await createPlayer(app, { steamId: 300010004 });
    await createPlayer(app, { steamId: 300010005 });
    await createPlayer(app, { steamId: 300010006 });
    await createPlayer(app, { steamId: 300010007 });
    await createPlayer(app, { steamId: 300010008 });
    await createPlayer(app, { steamId: 300010009 });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    signValid = true;
    precreateMock.mockClear();
    verifyMock.mockClear();
  });

  const apiKey = 'Invalid_NotOnDedicatedServer';

  const buildNotify = (overrides: Record<string, string> = {}) => ({
    out_trade_no: '',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '28.00',
    trade_no: '2026050322001400000000001',
    buyer_id: '2088000000000001',
    buyer_logon_id: 'sandbox***@example.com',
    gmt_payment: '2026-05-03 20:00:00',
    sign: 'mock-sign',
    sign_type: 'RSA2',
    notify_id: 'mock-notify-id',
    ...overrides,
  });

  const createOrder = async (body: {
    steamId: number;
    productCode: AlipayProductCode;
    quantity?: number;
  }) =>
    request(app.getHttpServer())
      .post(`${prefixPath}/order/create`)
      .set('x-api-key', apiKey)
      .send(body);

  const queryOrder = async (outTradeNo: string) =>
    request(app.getHttpServer())
      .get(`${prefixPath}/order/query`)
      .set('x-api-key', apiKey)
      .query({ outTradeNo });

  const postWebhook = async (notify: Record<string, string>) =>
    request(app.getHttpServer()).post(`${prefixPath}/webhook`).type('form').send(notify);

  describe('POST /alipay/order/create', () => {
    it('单份会员订单：返回 outTradeNo / qrCode / totalAmount=28.00，DB 写 WAITING', async () => {
      const res = await createOrder({
        steamId: 300010001,
        productCode: AlipayProductCode.MEMBER_PREMIUM,
      });

      expect(res.status).toBe(201);
      expect(res.body.outTradeNo).toMatch(/^ali-300010001-\d+-[a-z0-9]{4}$/);
      expect(res.body.totalAmount).toBe('28.00');
      expect(res.body.qrCode).toMatch(/^https:\/\/qr\.alipay\.com\//);
      expect(precreateMock).toHaveBeenCalledTimes(1);

      const status = await queryOrder(res.body.outTradeNo);
      expect(status.status).toBe(200);
      expect(status.body.status).toBe(AlipayTradeStatus.WAITING);
    });

    it('积分订单 quantity=2：totalAmount 按倍乘', async () => {
      const res = await createOrder({
        steamId: 300010002,
        productCode: AlipayProductCode.POINTS_TIER1,
        quantity: 2,
      });

      expect(res.status).toBe(201);
      expect(res.body.totalAmount).toBe('156.00');
    });

    it('未知 productCode → 400', async () => {
      const res = await createOrder({
        steamId: 300010003,
        productCode: 'NOT_A_REAL_CODE' as AlipayProductCode,
      });
      expect(res.status).toBe(400);
    });

    it('quantity=0 → 400', async () => {
      const res = await createOrder({
        steamId: 300010003,
        productCode: AlipayProductCode.MEMBER_PREMIUM,
        quantity: 0,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /alipay/order/query', () => {
    it('订单不存在 → 404', async () => {
      const res = await queryOrder('ali-not-exist');
      expect(res.status).toBe(404);
    });

    it('缺 outTradeNo 参数 → 400', async () => {
      const res = await request(app.getHttpServer())
        .get(`${prefixPath}/order/query`)
        .set('x-api-key', apiKey);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /alipay/webhook - 成功路径', () => {
    it('MEMBER_PREMIUM quantity=1：响应 success（text/plain）+ 订单 SUCCESS + 会员/积分到账', async () => {
      const steamId = 300010004;
      const order = await createOrder({
        steamId,
        productCode: AlipayProductCode.MEMBER_PREMIUM,
      });
      const outTradeNo = order.body.outTradeNo;

      const res = await postWebhook(buildNotify({ out_trade_no: outTradeNo }));

      // NestJS @Post 默认 201；webhook 只要 2xx + 纯文本 'success' 支付宝就认为成功
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(res.text).toBe('success');
      expect(res.headers['content-type']).toMatch(/text\/plain/);

      const status = await queryOrder(outTradeNo);
      expect(status.body.status).toBe(AlipayTradeStatus.SUCCESS);

      const member = await getMemberDto(app, steamId);
      expect(member.level).toBe(MemberLevel.PREMIUM);
      expect(member.enable).toBe(true);

      const player = await getPlayer(app, steamId);
      expect(player.memberPointTotal).toBe(1000);
    });

    it('MEMBER_PREMIUM quantity=3：发放 3 个月会员（积分 +3000）', async () => {
      const steamId = 300010005;
      const order = await createOrder({
        steamId,
        productCode: AlipayProductCode.MEMBER_PREMIUM,
        quantity: 3,
      });
      const outTradeNo = order.body.outTradeNo;

      const res = await postWebhook(
        buildNotify({ out_trade_no: outTradeNo, total_amount: '84.00' }),
      );

      expect(res.text).toBe('success');
      const player = await getPlayer(app, steamId);
      expect(player.memberPointTotal).toBe(3000); // 1000 * 3 个月
    });

    it('POINTS_TIER1 quantity=2：积分 +7000（无 member 记录）', async () => {
      const steamId = 300010006;
      const order = await createOrder({
        steamId,
        productCode: AlipayProductCode.POINTS_TIER1,
        quantity: 2,
      });
      const outTradeNo = order.body.outTradeNo;

      const res = await postWebhook(
        buildNotify({ out_trade_no: outTradeNo, total_amount: '156.00' }),
      );

      expect(res.text).toBe('success');
      const player = await getPlayer(app, steamId);
      expect(player.memberPointTotal).toBe(7000);

      // 积分订单不应创建 member 记录
      await expect(getMemberDto(app, steamId)).rejects.toThrow();
    });

    it('TRADE_FINISHED 也按成功处理', async () => {
      const steamId = 300010007;
      const order = await createOrder({
        steamId,
        productCode: AlipayProductCode.MEMBER_PREMIUM,
      });
      const outTradeNo = order.body.outTradeNo;

      const res = await postWebhook(
        buildNotify({ out_trade_no: outTradeNo, trade_status: 'TRADE_FINISHED' }),
      );

      expect(res.text).toBe('success');
      const status = await queryOrder(outTradeNo);
      expect(status.body.status).toBe(AlipayTradeStatus.SUCCESS);
    });
  });

  describe('POST /alipay/webhook - 异常路径', () => {
    it('验签失败：返回 failure，订单仍 WAITING，无奖励', async () => {
      const steamId = 300010008;
      const order = await createOrder({
        steamId,
        productCode: AlipayProductCode.MEMBER_PREMIUM,
      });
      const outTradeNo = order.body.outTradeNo;

      signValid = false;
      const res = await postWebhook(buildNotify({ out_trade_no: outTradeNo }));

      expect(res.text).toBe('failure');
      const status = await queryOrder(outTradeNo);
      expect(status.body.status).toBe(AlipayTradeStatus.WAITING);

      const player = await getPlayer(app, steamId);
      expect(player.memberPointTotal).toBe(0);
    });

    it('金额不匹配：返回 failure，订单不变', async () => {
      const order = await createOrder({
        steamId: 300010009,
        productCode: AlipayProductCode.MEMBER_PREMIUM,
      });
      const outTradeNo = order.body.outTradeNo;

      const res = await postWebhook(
        buildNotify({ out_trade_no: outTradeNo, total_amount: '0.01' }),
      );

      expect(res.text).toBe('failure');
      const status = await queryOrder(outTradeNo);
      expect(status.body.status).toBe(AlipayTradeStatus.WAITING);
    });

    it('trade_status=WAIT_BUYER_PAY：返回 failure', async () => {
      const order = await createOrder({
        steamId: 300010001,
        productCode: AlipayProductCode.MEMBER_PREMIUM,
      });
      const outTradeNo = order.body.outTradeNo;

      const res = await postWebhook(
        buildNotify({ out_trade_no: outTradeNo, trade_status: 'WAIT_BUYER_PAY' }),
      );

      expect(res.text).toBe('failure');
    });

    it('缺 out_trade_no：返回 failure', async () => {
      const notify = buildNotify();
      delete (notify as any).out_trade_no;
      const res = await postWebhook(notify);
      expect(res.text).toBe('failure');
    });

    it('订单不存在：返回 failure', async () => {
      const res = await postWebhook(buildNotify({ out_trade_no: 'ali-not-exist' }));
      expect(res.text).toBe('failure');
    });
  });

  describe('POST /alipay/webhook - 幂等', () => {
    it('重发同一 webhook：第 2 次返回 success 但奖励不重复发放', async () => {
      const steamId = 300010002;
      const order = await createOrder({
        steamId,
        productCode: AlipayProductCode.POINTS_TIER1,
      });
      const outTradeNo = order.body.outTradeNo;
      const beforePoints = (await getPlayer(app, steamId)).memberPointTotal;

      const r1 = await postWebhook(
        buildNotify({ out_trade_no: outTradeNo, total_amount: '78.00' }),
      );
      expect(r1.text).toBe('success');
      const afterFirst = (await getPlayer(app, steamId)).memberPointTotal;
      expect(afterFirst - beforePoints).toBe(3500);

      const r2 = await postWebhook(
        buildNotify({ out_trade_no: outTradeNo, total_amount: '78.00' }),
      );
      expect(r2.text).toBe('success');
      const afterSecond = (await getPlayer(app, steamId)).memberPointTotal;
      expect(afterSecond).toBe(afterFirst); // 不重复加
    });
  });
});
