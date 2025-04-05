import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { MemberLevel } from '../src/members/entities/members.entity';

import { get, initTest } from './util/util-http';
import { createPlayer, getMemberDto, getPlayer } from './util/util-player';

describe('MemberController (e2e)', () => {
  let app: INestApplication;
  const prefixPath = '/api/afdian';
  const daysPerMonth = 31;

  // 创建基础的 webhook 请求数据
  const createWebhookRequest = (order: Record<string, unknown>) => ({
    ec: 200,
    em: 'ok',
    data: {
      type: 'order',
      order: {
        total_amount: '5.00',
        show_amount: '5.00',
        status: 2,
        redeem_id: '',
        product_type: 0,
        discount: '0.00',
        sku_detail: [],
        address_person: 'name',
        address_phone: '12345678901',
        address_address: '1234567',
        ...order,
      },
    },
  });

  beforeAll(async () => {
    app = await initTest();
    // 创建测试所需的玩家
    await createPlayer(app, { steamId: 200000101 });
    await createPlayer(app, { steamId: 200000102 });
    await createPlayer(app, { steamId: 200000103 });
    await createPlayer(app, { steamId: 200000104 });
    await createPlayer(app, { steamId: 200000105 });
    await createPlayer(app, { steamId: 200000201 });
    await createPlayer(app, { steamId: 200000202 });
    await createPlayer(app, { steamId: 200000203 });
    await createPlayer(app, { steamId: 200000111 });
  });

  afterAll(async () => {
    await app.close();
  });
  // ======================== 爱发电自动开通会员 ========================
  describe('/afdian/webhook (POST)', () => {
    describe('Request Validation', () => {
      it('unauth error', async () => {
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(createWebhookRequest({}))
          .query({ token: 'wrongToken' });
        expect(responseCreate.status).toEqual(401);
      });

      it('ec not equal 200', async () => {
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send({
            ec: 500,
            em: 'ok',
            data: {
              type: 'order',
              order: {},
            },
          })
          .query({ token: 'afdian-webhook' });
        expect(responseCreate.status).toEqual(400);
      });

      it('order not exist', async () => {
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send({
            ec: 200,
            em: 'ok',
          })
          .query({ token: 'afdian-webhook' });
        expect(responseCreate.status).toEqual(400);
      });
    });

    describe('爱发电Webhook开通会员', () => {
      it.each([
        [MemberLevel.NORMAL, 1, 200000101, '6e27c8103bd011ed887852540025c377', 300],
        [MemberLevel.NORMAL, 12, 200000102, '6e27c8103bd011ed887852540025c377', 3600],
        [MemberLevel.PREMIUM, 1, 200000103, '6c206f360d4c11f0a2cb52540025c377', 1000],
        [MemberLevel.PREMIUM, 12, 200000104, '6c206f360d4c11f0a2cb52540025c377', 12000],
      ])(
        '爱发电Webhook开通%s会员成功 %s个月',
        async (level, month, memberId, planId, memberPoint) => {
          const dateNextMonth = new Date();
          dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth * month);
          const responseCreate = await request(app.getHttpServer())
            .post(`${prefixPath}/webhook`)
            .send(
              createWebhookRequest({
                out_trade_no: `202106232138371083${memberId}`,
                user_id: `adf397fe8374811eaacee525${memberId}`,
                plan_id: planId,
                month: month,
                remark: `${memberId}`,
              }),
            )
            .query({ token: 'afdian-webhook' });
          expect(responseCreate.status).toEqual(201);
          expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });

          // 检查会员期限
          const memberDto = await getMemberDto(app, memberId);
          expect(memberDto.expireDateString).toEqual(dateNextMonth.toISOString().split('T')[0]);
          expect(memberDto.enable).toEqual(true);
          expect(memberDto.level).toEqual(level);

          // 检查玩家积分
          const player = await getPlayer(app, memberId);
          expect(player.memberPointTotal).toEqual(memberPoint);
        },
      );

      it('爱发电Webhook开通会员成功 webhook重复请求', async () => {
        const memberId = 200000105;
        const month = 12;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth * month);
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371083454010620',
              user_id: 'adf397fe8374811eaacee525200000104',
              plan_id: '6e27c8103bd011ed887852540025c377',
              month: month,
              remark: `${memberId}`,
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });

        // 重复请求
        const responseCreate2 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371083454010620', // 重复订单号
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: '6e27c8103bd011ed887852540025c377',
              month: month,
              remark: `${memberId}`,
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate2.status).toEqual(201);
        expect(responseCreate2.body).toEqual({ ec: 200, em: 'ok' });

        // 检查会员期限
        const memberDto = await getMemberDto(app, memberId);
        expect(memberDto.expireDateString).toEqual(dateNextMonth.toISOString().split('T')[0]);
        expect(memberDto.enable).toEqual(true);
        expect(memberDto.level).toEqual(MemberLevel.NORMAL);
        // 检查玩家积分
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(300 * month);
      });

      it('爱发电Webhook开通会员失败 未留言ID', async () => {
        const memberId = 200000110;
        const month = 12;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth * month);
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371083454010622',
              user_id: 'adf397fe8374811eaacee525200000110',
              plan_id: '6e27c8103bd011ed887852540025c377',
              month: month,
              remark: 'xxxx message',
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual({
          ec: 200,
          em: '[Error] 未能正确获取Dota2 ID',
        });

        const responseAfter = await get(app, `/api/members/${memberId}`);
        expect(responseAfter.status).toEqual(404);
      });

      it('爱发电Webhook开通会员成功 未留言ID 用相同爱发电ID之前留存的steamID激活', async () => {
        const memberId = 200000111;
        const month = 12;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth * month);
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371082000001111',
              user_id: 'adf397fe8374811eaacee525200000111',
              plan_id: '6e27c8103bd011ed887852540025c377',
              month: month / 2,
              remark: '200000111',
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });

        const responseCreate2 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371082000001112',
              user_id: 'adf397fe8374811eaacee525200000111',
              plan_id: '6e27c8103bd011ed887852540025c377',
              month: month / 2,
              remark: '', // 未留言
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate2.status).toEqual(201);
        expect(responseCreate2.body).toEqual({ ec: 200, em: 'ok' });

        // 检查会员期限
        const memberDto = await getMemberDto(app, memberId);
        expect(memberDto.expireDateString).toEqual(dateNextMonth.toISOString().split('T')[0]);
        expect(memberDto.enable).toEqual(true);
        expect(memberDto.level).toEqual(MemberLevel.NORMAL);
        // 检查玩家积分
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(300 * month);
      });

      it('爱发电Webhook开通会员失败 玩家不存在', async () => {
        const memberId = 200000112; // 未创建的玩家ID
        const month = 12;
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371083454010627',
              user_id: 'adf397fe8374811eaacee525200000112',
              plan_id: '6e27c8103bd011ed887852540025c377',
              month: month,
              remark: `${memberId}`,
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual({
          ec: 200,
          em: '[Error] 未能正确获取Dota2 ID',
        });

        const responseAfter = await get(app, `/api/members/${memberId}`);
        expect(responseAfter.status).toEqual(404);
      });

      it('爱发电Webhook开通会员失败 玩家不存在 用相同爱发电ID之前留存的steamID激活', async () => {
        const memberId = 200000113; // 未创建的玩家ID
        const memberIdNotExist = 200000199; // 不存在的玩家ID
        const month = 1;

        // 创建玩家
        await createPlayer(app, { steamId: memberId });
        // 第一次请求，记录爱发电ID和steamID
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371083454010628',
              user_id: 'adf397fe8374811eaacee525200000113',
              plan_id: '6e27c8103bd011ed887852540025c377',
              month: month,
              remark: `${memberId}`,
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual({
          ec: 200,
          em: 'ok',
        });

        // 第二次请求，使用相同的爱发电ID，但玩家已存在
        const responseCreate2 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371083454010629',
              user_id: 'adf397fe8374811eaacee525200000113',
              plan_id: '6e27c8103bd011ed887852540025c377',
              month: month,
              remark: `${memberIdNotExist}`,
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate2.status).toEqual(201);
        expect(responseCreate2.body).toEqual({ ec: 200, em: 'ok' });

        // 检查会员期限
        const monthTwice = 2;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth * monthTwice);
        const memberDto = await getMemberDto(app, memberId);
        expect(memberDto.expireDateString).toEqual(dateNextMonth.toISOString().split('T')[0]);
        expect(memberDto.enable).toEqual(true);
        expect(memberDto.level).toEqual(MemberLevel.NORMAL);
        // 检查玩家积分
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(300 * monthTwice);
      });
    });

    describe('爱发电Webhook购买会员积分', () => {
      it('爱发电Webhook购买会员积分 单次', async () => {
        const memberId = 200000201;
        const month = 1;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth * month);
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371083454010623',
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: '6f73a48e546011eda08052540025c377', // tire1 3500
              month: month,
              remark: `${memberId}`,
              product_type: 1,
              sku_detail: [
                {
                  sku_id: 'b082342c4aba11ebb5cb52540025c377',
                  count: 1,
                  name: '会员积分',
                },
              ],
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });
        // 检查玩家积分
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(3500);
      });

      it('爱发电Webhook购买会员积分 单次多个', async () => {
        const memberId = 200000202;
        const month = 1;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth * month);
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371083454010624',
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: '0783fa70688a11edacd452540025c377', // tire3 28000
              month: month,
              remark: `${memberId}`,
              product_type: 1,
              sku_detail: [
                {
                  sku_id: 'b082342c4aba11ebb5cb52540025c377',
                  count: 2,
                  name: '会员积分',
                },
              ],
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });
        // 检查玩家积分
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(56000);
      });

      it('爱发电Webhook购买会员积分 多次', async () => {
        const memberId = 200000203;
        const month = 1;
        const dateNextMonth = new Date();
        dateNextMonth.setUTCDate(new Date().getUTCDate() + daysPerMonth * month);
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371083454010625',
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: '6f73a48e546011eda08052540025c377', // tire1 3500
              month: month,
              remark: `${memberId}`,
              product_type: 1,
              sku_detail: [
                {
                  sku_id: 'b082342c4aba11ebb5cb52540025c377',
                  count: 1,
                  name: '会员积分',
                },
              ],
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate.status).toEqual(201);
        expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });
        const responseCreate2 = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send(
            createWebhookRequest({
              out_trade_no: '202106232138371083454010626',
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: '29df1632688911ed9e7052540025c377', // tire2 11000
              month: month,
              remark: `${memberId}`,
              product_type: 1,
              sku_detail: [
                {
                  sku_id: 'b082342c4aba11ebb5cb52540025c377',
                  count: 1,
                  name: '会员积分',
                },
              ],
            }),
          )
          .query({ token: 'afdian-webhook' });
        expect(responseCreate2.status).toEqual(201);
        expect(responseCreate2.body).toEqual({ ec: 200, em: 'ok' });
        // 检查玩家积分
        const player = await getPlayer(app, memberId);
        expect(player.memberPointTotal).toEqual(14500);
      });
    });
  });
});
