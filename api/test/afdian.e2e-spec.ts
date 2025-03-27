import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { get, initTest } from './util/util-http';
import { getPlayer } from './util/util-player';

describe('MemberController (e2e)', () => {
  let app: INestApplication;
  const prefixPath = '/api/afdian';

  // 创建基础的 webhook 请求数据
  const createWebhookRequest = (order: any) => ({
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

    it('爱发电Webhook开通会员成功', async () => {
      const memberId = 200000103;
      const month = 12;
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month);
      const expectBodyJson = {
        steamId: memberId,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
      };
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send(createWebhookRequest({
          out_trade_no: '202106232138371083454010621',
          user_id: 'adf397fe8374811eaacee52540025c377',
          plan_id: 'a45353328af911eb973052540025c377',
          month: month,
          remark: `${memberId}`,
        }))
        .query({ token: 'afdian-webhook' });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });

      // 检查会员期限
      const responseAfter = await get(app, `/api/members/${memberId}`);
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
      // 检查玩家积分
      const player = await getPlayer(app, memberId);
      expect(player.memberPointTotal).toEqual(300 * month);
    });

    it('爱发电Webhook开通会员成功 webhook重复请求', async () => {
      const memberId = 200000104;
      const month = 12;
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month);
      const expectBodyJson = {
        steamId: memberId,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
      };
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send(createWebhookRequest({
          out_trade_no: '202106232138371083454010620',
          user_id: 'adf397fe8374811eaacee525200000104',
          plan_id: 'a45353328af911eb973052540025c377',
          month: month,
          remark: `${memberId}`,
        }))
        .query({ token: 'afdian-webhook' });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });

      // 重复请求
      const responseCreate2 = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send(createWebhookRequest({
          out_trade_no: '202106232138371083454010620', // 重复订单号
          user_id: 'adf397fe8374811eaacee52540025c377',
          plan_id: 'a45353328af911eb973052540025c377',
          month: month,
          remark: `${memberId}`,
        }))
        .query({ token: 'afdian-webhook' });
      expect(responseCreate2.status).toEqual(201);
      expect(responseCreate2.body).toEqual({ ec: 200, em: 'ok' });

      // 检查会员期限
      const responseAfter = await get(app, `/api/members/${memberId}`);
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
      // 检查玩家积分
      const player = await getPlayer(app, memberId);
      expect(player.memberPointTotal).toEqual(300 * month);
    });

    it('爱发电Webhook开通会员失败 未留言ID', async () => {
      const memberId = 200000110;
      const month = 12;
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month);
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send(createWebhookRequest({
          out_trade_no: '202106232138371083454010622',
          user_id: 'adf397fe8374811eaacee525200000110',
          plan_id: 'a45353328af911eb973052540025c377',
          month: month,
          remark: 'xxxx message',
        }))
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
      dateNextMonth.setUTCDate(new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month);
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send(createWebhookRequest({
          out_trade_no: '202106232138371082000001111',
          user_id: 'adf397fe8374811eaacee525200000111',
          plan_id: 'a45353328af911eb973052540025c377',
          month: month / 2,
          remark: '200000111',
        }))
        .query({ token: 'afdian-webhook' });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });

      const responseCreate2 = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send(createWebhookRequest({
          out_trade_no: '202106232138371082000001112',
          user_id: 'adf397fe8374811eaacee525200000111',
          plan_id: 'a45353328af911eb973052540025c377',
          month: month / 2,
          remark: '', // 未留言
        }))
        .query({ token: 'afdian-webhook' });
      expect(responseCreate2.status).toEqual(201);
      expect(responseCreate2.body).toEqual({ ec: 200, em: 'ok' });

      // 检查会员期限
      const expectBodyJson = {
        steamId: memberId,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
      };
      const responseAfter = await get(app, `/api/members/${memberId}`);
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
      // 检查玩家积分
      const player = await getPlayer(app, memberId);
      expect(player.memberPointTotal).toEqual(300 * month);
    });

    it('爱发电Webhook购买会员积分 单次', async () => {
      const memberId = 200000201;
      const month = 1;
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month);
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send(createWebhookRequest({
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
        }))
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
      dateNextMonth.setUTCDate(new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month);
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send(createWebhookRequest({
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
        }))
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
      dateNextMonth.setUTCDate(new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month);
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send(createWebhookRequest({
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
        }))
        .query({ token: 'afdian-webhook' });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });
      const responseCreate2 = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send(createWebhookRequest({
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
        }))
        .query({ token: 'afdian-webhook' });
      expect(responseCreate2.status).toEqual(201);
      expect(responseCreate2.body).toEqual({ ec: 200, em: 'ok' });
      // 检查玩家积分
      const player = await getPlayer(app, memberId);
      expect(player.memberPointTotal).toEqual(14500);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
