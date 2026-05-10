import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from 'nestjs-fireorm';

import { AnalyticsPurchaseService } from '../analytics/analytics.purchase.service';
import { MemberLevel } from '../members/entities/members.entity';
import { MembersService } from '../members/members.service';
import { PlayerService } from '../player/player.service';

import { AlipayApiService } from './alipay.api.service';
import { ALIPAY_PRODUCT_TABLE, ALIPAY_QR_EXPIRE_MS, MEMBER_DISCOUNT_TIERS } from './alipay.constants';
import { AlipayService } from './alipay.service';
import { CreateAlipayOrderDto } from './dto/create-alipay-order.dto';
import { AlipayOrder } from './entities/alipay-order.entity';
import { AlipayProductCode } from './enums/alipay-product-code.enum';
import { AlipayTradeStatus } from './enums/alipay-trade-status.enum';

describe('AlipayService', () => {
  let service: AlipayService;
  let apiService: jest.Mocked<AlipayApiService>;
  let repo: {
    create: jest.Mock;
    update: jest.Mock;
    findById: jest.Mock;
  };
  let membersService: jest.Mocked<MembersService>;
  let playerService: jest.Mocked<PlayerService>;
  let analyticsPurchaseService: jest.Mocked<AnalyticsPurchaseService>;

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity })),
      update: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findById: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlipayService,
        {
          provide: AlipayApiService,
          useValue: {
            precreate: jest.fn().mockResolvedValue('https://qr.alipay.com/mock'),
            verifyNotifySign: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: getRepositoryToken(AlipayOrder),
          useValue: repo,
        },
        {
          provide: MembersService,
          useValue: { createMember: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: PlayerService,
          useValue: { upsertAddPoint: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: AnalyticsPurchaseService,
          useValue: { alipayPurchase: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = moduleRef.get<AlipayService>(AlipayService);
    apiService = moduleRef.get(AlipayApiService);
    membersService = moduleRef.get(MembersService);
    playerService = moduleRef.get(PlayerService);
    analyticsPurchaseService = moduleRef.get(AnalyticsPurchaseService);
  });

  describe('calculatePrice', () => {
    it.each([
      [1, 2800, '28.00', 6],
      [2, 5600, '56.00', 6],
      [3, 8040, '80.40', 10],
      [4, 10720, '107.20', 10],
      [12, 30000, '300.00', 16],
      [36, 85680, '856.80', 20],
    ])(
      '会员 quantity=%i → %i¢ / %s / discountPercent=%i',
      (quantity, cent, yuan, discount) => {
        const r = service.calculatePrice(ALIPAY_PRODUCT_TABLE.MEMBER_PREMIUM, quantity);
        expect(r.totalAmountCent).toBe(cent);
        expect(r.totalAmount).toBe(yuan);
        expect(r.discountPercent).toBe(discount);
      },
    );

    it('MEMBER_DISCOUNT_TIERS 从大到小排列，确保 find 查表正确', () => {
      for (let i = 0; i < MEMBER_DISCOUNT_TIERS.length - 1; i++) {
        expect(MEMBER_DISCOUNT_TIERS[i].minMonths).toBeGreaterThan(
          MEMBER_DISCOUNT_TIERS[i + 1].minMonths,
        );
      }
    });

    it.each([
      [AlipayProductCode.POINTS_TIER1, 7800, '78.00'],
      [AlipayProductCode.POINTS_TIER2, 23800, '238.00'],
      [AlipayProductCode.POINTS_TIER3, 56800, '568.00'],
    ])('单份积分档位 %s 价格正确，discountPercent=0', (code, cent, yuan) => {
      const r = service.calculatePrice(ALIPAY_PRODUCT_TABLE[code], 1);
      expect(r.totalAmountCent).toBe(cent);
      expect(r.totalAmount).toBe(yuan);
      expect(r.discountPercent).toBe(0);
    });

    it('totalAmount 始终保留两位小数（满整元也带 .00）', () => {
      expect(service.calculatePrice(ALIPAY_PRODUCT_TABLE.MEMBER_PREMIUM, 1).totalAmount).toBe(
        '28.00',
      );
    });

    it.each([0, -1, 1.5, NaN])('quantity 非法值 %s 抛 BadRequestException', (q) => {
      expect(() => service.calculatePrice(ALIPAY_PRODUCT_TABLE.MEMBER_PREMIUM, q)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('createOrder', () => {
    const baseDto: CreateAlipayOrderDto = {
      steamId: 123456789,
      productCode: AlipayProductCode.MEMBER_PREMIUM,
      quantity: 1,
    };

    it('单份会员：金额 ¥28.00、subject 用 subjectUnit', async () => {
      const res = await service.createOrder(baseDto);

      expect(res.totalAmount).toBe('28.00');
      expect(res.subject).toBe(ALIPAY_PRODUCT_TABLE[AlipayProductCode.MEMBER_PREMIUM].subjectUnit);
      expect(res.qrCode).toBe('https://qr.alipay.com/mock');
      expect(res.outTradeNo).toMatch(/^ali-123456789-\d+-[a-z0-9]{4}$/);
      expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('3月会员：适用9折阶梯价 ¥80.40、subject 追加月数', async () => {
      const res = await service.createOrder({ ...baseDto, quantity: 3 });

      expect(res.totalAmount).toBe('80.40');
      expect(res.subject).toBe(`${ALIPAY_PRODUCT_TABLE.MEMBER_PREMIUM.subjectUnit} 3个月`);
    });

    it.each([
      [12, '1年'],
      [24, '2年'],
      [36, '3年'],
    ])('会员 quantity=%i 显示 %s', async (quantity, label) => {
      const res = await service.createOrder({ ...baseDto, quantity });
      expect(res.subject).toBe(`${ALIPAY_PRODUCT_TABLE.MEMBER_PREMIUM.subjectUnit} ${label}`);
    });

    it('会员 quantity=13（非 12 倍数）仍按月显示', async () => {
      const res = await service.createOrder({ ...baseDto, quantity: 13 });
      expect(res.subject).toBe(`${ALIPAY_PRODUCT_TABLE.MEMBER_PREMIUM.subjectUnit} 13个月`);
    });

    it('多份积分：subject 追加 N 份（区别于会员的"个月"）', async () => {
      const res = await service.createOrder({
        steamId: 1,
        productCode: AlipayProductCode.POINTS_TIER1,
        quantity: 2,
      });

      expect(res.totalAmount).toBe('156.00'); // 7800 * 2 / 100
      expect(res.subject).toBe(`${ALIPAY_PRODUCT_TABLE.POINTS_TIER1.subjectUnit} 2份`);
    });

    it('quantity 缺省时按 1 处理', async () => {
      const { quantity: _q, ...dtoWithoutQuantity } = baseDto;
      const res = await service.createOrder(dtoWithoutQuantity as CreateAlipayOrderDto);

      expect(res.totalAmount).toBe('28.00');
      expect(res.subject).toBe(ALIPAY_PRODUCT_TABLE.MEMBER_PREMIUM.subjectUnit);
    });

    it('未知 productCode 抛 BadRequestException', async () => {
      await expect(
        service.createOrder({
          ...baseDto,
          productCode: 'NOT_A_REAL_CODE' as AlipayProductCode,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(apiService.precreate).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('先 create WAITING（qrCode 空）→ 调 precreate → update 写回 qrCode', async () => {
      const callOrder: string[] = [];
      repo.create.mockImplementationOnce(async (entity) => {
        callOrder.push('create');
        expect(entity.qrCode).toBe('');
        expect(entity.status).toBe(AlipayTradeStatus.WAITING);
        return { ...entity };
      });
      apiService.precreate.mockImplementationOnce(async () => {
        callOrder.push('precreate');
        return 'https://qr.alipay.com/scan-me';
      });
      repo.update.mockImplementationOnce(async (entity) => {
        callOrder.push('update');
        expect(entity.qrCode).toBe('https://qr.alipay.com/scan-me');
        return entity;
      });

      await service.createOrder(baseDto);

      expect(callOrder).toEqual(['create', 'precreate', 'update']);
    });

    it('outTradeNo 在并发场景仍然唯一（10 次同 steamId 无重复）', async () => {
      const ids = await Promise.all(
        Array.from({ length: 10 }, () => service.createOrder(baseDto).then((r) => r.outTradeNo)),
      );
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('落库实体包含价格分单位与 quantity', async () => {
      await service.createOrder({ ...baseDto, quantity: 2 });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          steamId: baseDto.steamId,
          productCode: baseDto.productCode,
          quantity: 2,
          totalAmountCent: 5600,
          discountPercent: 6,
          status: AlipayTradeStatus.WAITING,
        }),
      );
    });

    it('qrCodeExpiresAt = now + 2h', async () => {
      const before = Date.now();
      const res = await service.createOrder(baseDto);
      const after = Date.now();
      const expiresMs = new Date(res.expiresAt).getTime();

      expect(expiresMs).toBeGreaterThanOrEqual(before + ALIPAY_QR_EXPIRE_MS);
      expect(expiresMs).toBeLessThanOrEqual(after + ALIPAY_QR_EXPIRE_MS);
    });
  });

  describe('getOrderStatus', () => {
    it('返回 outTradeNo 和 status', async () => {
      repo.findById.mockResolvedValueOnce({
        outTradeNo: 'ali-1-2-x',
        status: AlipayTradeStatus.WAITING,
      });
      const res = await service.getOrderStatus('ali-1-2-x');
      expect(res).toEqual({ outTradeNo: 'ali-1-2-x', status: AlipayTradeStatus.WAITING });
    });

    it('订单不存在抛 NotFoundException', async () => {
      repo.findById.mockResolvedValueOnce(undefined);
      await expect(service.getOrderStatus('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleWebhook', () => {
    const buildOrder = (overrides: Partial<AlipayOrder> = {}): AlipayOrder =>
      ({
        id: 'ali-123-1-x',
        outTradeNo: 'ali-123-1-x',
        steamId: 123,
        productCode: AlipayProductCode.MEMBER_PREMIUM,
        quantity: 1,
        totalAmountCent: 2800,
        subject: '高级会员',
        status: AlipayTradeStatus.WAITING,
        qrCode: 'https://qr.alipay.com/mock',
        qrCodeExpiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      }) as AlipayOrder;

    const buildNotify = (overrides: Record<string, string> = {}): Record<string, string> => ({
      out_trade_no: 'ali-123-1-x',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '28.00',
      trade_no: '2026050322001400000000001',
      buyer_id: '2088000000000001',
      buyer_logon_id: 'sandbox***@example.com',
      gmt_payment: '2026-05-03 20:00:00',
      sign: 'mock-sign',
      sign_type: 'RSA2',
      ...overrides,
    });

    it('验签失败：返回 failure，不读 Firestore，不发奖', async () => {
      apiService.verifyNotifySign.mockReturnValueOnce(false);

      const result = await service.handleWebhook(buildNotify());

      expect(result).toBe('failure');
      expect(repo.findById).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
      expect(membersService.createMember).not.toHaveBeenCalled();
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
      expect(analyticsPurchaseService.alipayPurchase).not.toHaveBeenCalled();
    });

    it('订单不存在：返回 failure', async () => {
      repo.findById.mockResolvedValueOnce(undefined);
      const result = await service.handleWebhook(buildNotify());
      expect(result).toBe('failure');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('幂等：订单已 SUCCESS，返回 success 但不重复发奖', async () => {
      repo.findById.mockResolvedValueOnce(buildOrder({ status: AlipayTradeStatus.SUCCESS }));

      const result = await service.handleWebhook(buildNotify());

      expect(result).toBe('success');
      expect(membersService.createMember).not.toHaveBeenCalled();
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
      expect(analyticsPurchaseService.alipayPurchase).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('trade_status 非 TRADE_SUCCESS/TRADE_FINISHED：返回 failure', async () => {
      repo.findById.mockResolvedValueOnce(buildOrder());

      const result = await service.handleWebhook(buildNotify({ trade_status: 'WAIT_BUYER_PAY' }));

      expect(result).toBe('failure');
      expect(membersService.createMember).not.toHaveBeenCalled();
    });

    it('金额不匹配：返回 failure，不发奖', async () => {
      repo.findById.mockResolvedValueOnce(buildOrder({ totalAmountCent: 2800 }));

      const result = await service.handleWebhook(buildNotify({ total_amount: '0.01' }));

      expect(result).toBe('failure');
      expect(membersService.createMember).not.toHaveBeenCalled();
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('缺 out_trade_no：返回 failure', async () => {
      const notify = buildNotify();
      delete notify.out_trade_no;
      const result = await service.handleWebhook(notify);
      expect(result).toBe('failure');
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('会员订单 quantity=1：调 MembersService.createMember(month=1, level=PREMIUM)', async () => {
      const order = buildOrder({ productCode: AlipayProductCode.MEMBER_PREMIUM, quantity: 1 });
      repo.findById.mockResolvedValueOnce(order);

      const result = await service.handleWebhook(buildNotify());

      expect(result).toBe('success');
      expect(membersService.createMember).toHaveBeenCalledWith({
        steamId: 123,
        month: 1,
        level: MemberLevel.PREMIUM,
      });
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
    });

    it('会员订单 quantity=3：month 取 quantity 值', async () => {
      const order = buildOrder({
        productCode: AlipayProductCode.MEMBER_PREMIUM,
        quantity: 3,
        totalAmountCent: 8040,
      });
      repo.findById.mockResolvedValueOnce(order);

      await service.handleWebhook(buildNotify({ total_amount: '80.40' }));

      expect(membersService.createMember).toHaveBeenCalledWith({
        steamId: 123,
        month: 3,
        level: MemberLevel.PREMIUM,
      });
    });

    it('积分订单：调 upsertAddPoint(reward.points * quantity)', async () => {
      const order = buildOrder({
        productCode: AlipayProductCode.POINTS_TIER1,
        quantity: 2,
        totalAmountCent: 15600,
      });
      repo.findById.mockResolvedValueOnce(order);

      await service.handleWebhook(buildNotify({ total_amount: '156.00' }));

      expect(playerService.upsertAddPoint).toHaveBeenCalledWith(123, {
        memberPointTotal: 7000, // 3500 * 2
      });
      expect(membersService.createMember).not.toHaveBeenCalled();
    });

    it.each([
      [AlipayProductCode.POINTS_TIER1, 1, 7800, '78.00', 3500],
      [AlipayProductCode.POINTS_TIER2, 1, 23800, '238.00', 11000],
      [AlipayProductCode.POINTS_TIER3, 1, 56800, '568.00', 28000],
    ])(
      '积分档位 %s 单份发放正确积分',
      async (code, quantity, totalAmountCent, amountStr, points) => {
        const order = buildOrder({ productCode: code, quantity, totalAmountCent });
        repo.findById.mockResolvedValueOnce(order);

        await service.handleWebhook(buildNotify({ total_amount: amountStr }));

        expect(playerService.upsertAddPoint).toHaveBeenCalledWith(
          123,
          expect.objectContaining({ memberPointTotal: points }),
        );
      },
    );

    it('成功后写订单 SUCCESS + alipayTradeNo + buyer 信息 + rawNotify', async () => {
      const order = buildOrder();
      repo.findById.mockResolvedValueOnce(order);

      await service.handleWebhook(buildNotify());

      expect(repo.update).toHaveBeenCalledTimes(1);
      const updated = repo.update.mock.calls[0][0];
      expect(updated.status).toBe(AlipayTradeStatus.SUCCESS);
      expect(updated.alipayTradeNo).toBe('2026050322001400000000001');
      expect(updated.buyerUserId).toBe('2088000000000001');
      expect(updated.buyerLogonId).toBe('sandbox***@example.com');
      expect(updated.rawNotify).toMatchObject({ trade_status: 'TRADE_SUCCESS' });
    });

    it('成功后发 GA4 alipayPurchase 事件', async () => {
      const order = buildOrder();
      repo.findById.mockResolvedValueOnce(order);

      await service.handleWebhook(buildNotify());

      expect(analyticsPurchaseService.alipayPurchase).toHaveBeenCalledTimes(1);
      const ev = analyticsPurchaseService.alipayPurchase.mock.calls[0][0];
      expect(ev.status).toBe(AlipayTradeStatus.SUCCESS);
      expect(ev.outTradeNo).toBe('ali-123-1-x');
    });

    it('TRADE_FINISHED 也按成功处理（部分商户场景）', async () => {
      const order = buildOrder();
      repo.findById.mockResolvedValueOnce(order);

      const result = await service.handleWebhook(buildNotify({ trade_status: 'TRADE_FINISHED' }));

      expect(result).toBe('success');
      expect(membersService.createMember).toHaveBeenCalled();
    });

    it('安全顺序：验签 必须早于 任何 Firestore 读写', async () => {
      apiService.verifyNotifySign.mockReturnValueOnce(false);

      await service.handleWebhook(buildNotify());

      expect(apiService.verifyNotifySign).toHaveBeenCalled();
      expect(repo.findById).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
