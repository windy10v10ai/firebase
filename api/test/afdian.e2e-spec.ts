import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { initTest } from './util';

describe('MemberController (e2e)', () => {
  let app: INestApplication;
  const prefixPath = '/api/afdian';

  beforeAll(async () => {
    app = await initTest();
  });
  // ======================== 爱发电自动开通会员 ========================
  describe('/afdian/webhook (POST)', () => {
    describe('Request Validation', () => {
      it('unauth error', async () => {
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send({
            ec: 200,
            em: 'ok',
            data: {
              type: 'order',
              order: {},
            },
          })
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
          .query({ token: 'afd' });
        expect(responseCreate.status).toEqual(400);
      });

      it('order not exist', async () => {
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send({
            ec: 200,
            em: 'ok',
          })
          .query({ token: 'afd' });
        expect(responseCreate.status).toEqual(400);
      });
      it('order not exist', async () => {
        const responseCreate = await request(app.getHttpServer())
          .post(`${prefixPath}/webhook`)
          .send({
            ec: 200,
            em: 'ok',
          })
          .query({ token: 'afd' });
        expect(responseCreate.status).toEqual(400);
      });
    });

    it('爱发电Webhook开通会员成功', async () => {
      const memberId = 200000103;
      const month = 12;
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(
        new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month,
      );
      const expectBodyJson = {
        steamId: memberId,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
      };
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send({
          ec: 200,
          em: 'ok',
          data: {
            type: 'order',
            order: {
              out_trade_no: '202106232138371083454010626',
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: 'a45353328af911eb973052540025c377',
              month: month,
              total_amount: '5.00',
              show_amount: '5.00',
              status: 2,
              remark: `${memberId}`,
              redeem_id: '',
              product_type: 0,
              discount: '0.00',
              sku_detail: [],
              address_person: 'name',
              address_phone: '12345678901',
              address_address: '1234567',
            },
          },
        })
        .query({ token: 'afd' });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });

      // 检查会员期限
      const responseAfter = await request(app.getHttpServer()).get(
        `/api/members/${memberId}`,
      );
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
      // 检查玩家积分
      const responsePlayer = await request(app.getHttpServer()).get(
        `/api/player/steamId/${memberId}`,
      );
      expect(responsePlayer.status).toEqual(200);
      expect(responsePlayer.body.memberPointTotal).toEqual(300 * month);
    });

    it('爱发电Webhook开通会员失败 信息不全', async () => {
      const memberId = 200000110;
      const month = 12;
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(
        new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month,
      );
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send({
          ec: 200,
          em: 'ok',
          data: {
            type: 'order',
            order: {
              out_trade_no: '202106232138371083454010626',
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: 'a45353328af911eb973052540025c377',
              month: month,
              total_amount: '5.00',
              show_amount: '5.00',
              status: 2,
              remark: 'xxxx message',
              redeem_id: '',
              product_type: 0,
              discount: '0.00',
              sku_detail: [],
              address_person: 'name',
              address_phone: '12345678901',
              address_address: '1234567',
            },
          },
        })
        .query({ token: 'afd' });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({
        ec: 200,
        em: '[Error] 未能正确获取Dota2 ID',
      });

      const responseAfter = await request(app.getHttpServer()).get(
        `/api/members/${memberId}`,
      );
      expect(responseAfter.status).toEqual(404);
    });

    it('爱发电Webhook购买会员积分 单次', async () => {
      const memberId = 200000201;
      const month = 12;
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(
        new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month,
      );
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send({
          ec: 200,
          em: 'ok',
          data: {
            type: 'order',
            order: {
              out_trade_no: '202106232138371083454010626',
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: '6f73a48e546011eda08052540025c377', // tire1 3200
              month: month,
              total_amount: '5.00',
              show_amount: '5.00',
              status: 2,
              remark: `${memberId}`,
              redeem_id: '',
              product_type: 1,
              discount: '0.00',
              sku_detail: [
                {
                  sku_id: 'b082342c4aba11ebb5cb52540025c377',
                  count: 1,
                  name: '会员积分',
                },
              ],
              address_person: 'name',
              address_phone: '12345678901',
              address_address: '1234567',
            },
          },
        })
        .query({ token: 'afd' });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });
      // 检查玩家积分
      const responsePlayer = await request(app.getHttpServer()).get(
        `/api/player/steamId/${memberId}`,
      );
      expect(responsePlayer.status).toEqual(200);
      expect(responsePlayer.body.memberPointTotal).toEqual(3200);
    });

    it('爱发电Webhook购买会员积分 单次多个', async () => {
      const memberId = 200000202;
      const month = 12;
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(
        new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month,
      );
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send({
          ec: 200,
          em: 'ok',
          data: {
            type: 'order',
            order: {
              out_trade_no: '202106232138371083454010626',
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: '0783fa70688a11edacd452540025c377', // tire3 26000
              month: month,
              total_amount: '5.00',
              show_amount: '5.00',
              status: 2,
              remark: `${memberId}`,
              redeem_id: '',
              product_type: 1,
              discount: '0.00',
              sku_detail: [
                {
                  sku_id: 'b082342c4aba11ebb5cb52540025c377',
                  count: 2,
                  name: '会员积分',
                },
              ],
              address_person: 'name',
              address_phone: '12345678901',
              address_address: '1234567',
            },
          },
        })
        .query({ token: 'afd' });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });
      // 检查玩家积分
      const responsePlayer = await request(app.getHttpServer()).get(
        `/api/player/steamId/${memberId}`,
      );
      expect(responsePlayer.status).toEqual(200);
      expect(responsePlayer.body.memberPointTotal).toEqual(52000);
    });

    it('爱发电Webhook购买会员积分 多次', async () => {
      const memberId = 200000203;
      const month = 12;
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(
        new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * month,
      );
      const responseCreate = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send({
          ec: 200,
          em: 'ok',
          data: {
            type: 'order',
            order: {
              out_trade_no: '202106232138371083454010626',
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: '6f73a48e546011eda08052540025c377', // tire1 3200
              month: month,
              total_amount: '5.00',
              show_amount: '5.00',
              status: 2,
              remark: `${memberId}`,
              redeem_id: '',
              product_type: 1,
              discount: '0.00',
              sku_detail: [
                {
                  sku_id: 'b082342c4aba11ebb5cb52540025c377',
                  count: 1,
                  name: '会员积分',
                },
              ],
              address_person: 'name',
              address_phone: '12345678901',
              address_address: '1234567',
            },
          },
        })
        .query({ token: 'afd' });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });
      const responseCreate2 = await request(app.getHttpServer())
        .post(`${prefixPath}/webhook`)
        .send({
          ec: 200,
          em: 'ok',
          data: {
            type: 'order',
            order: {
              out_trade_no: '202106232138371083454010626',
              user_id: 'adf397fe8374811eaacee52540025c377',
              plan_id: '29df1632688911ed9e7052540025c377', // tire2 10000
              month: month,
              total_amount: '5.00',
              show_amount: '5.00',
              status: 2,
              remark: `${memberId}`,
              redeem_id: '',
              product_type: 1,
              discount: '0.00',
              sku_detail: [
                {
                  sku_id: 'b082342c4aba11ebb5cb52540025c377',
                  count: 1,
                  name: '会员积分',
                },
              ],
              address_person: 'name',
              address_phone: '12345678901',
              address_address: '1234567',
            },
          },
        })
        .query({ token: 'afd' });
      expect(responseCreate2.status).toEqual(201);
      expect(responseCreate2.body).toEqual({ ec: 200, em: 'ok' });
      // 检查玩家积分
      const responsePlayer = await request(app.getHttpServer()).get(
        `/api/player/steamId/${memberId}`,
      );
      expect(responsePlayer.status).toEqual(200);
      expect(responsePlayer.body.memberPointTotal).toEqual(13200);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
