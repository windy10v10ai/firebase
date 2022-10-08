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

    it('爱发电Webhook返回成功 address_address', async () => {
      const memberId = 200000100;
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(
        new Date().getUTCDate() + +process.env.DAYS_PER_MONTH,
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
              month: 1,
              total_amount: '5.00',
              show_amount: '5.00',
              status: 2,
              remark: '',
              redeem_id: '',
              product_type: 0,
              discount: '0.00',
              sku_detail: [],
              address_person: '',
              address_phone: '',
              address_address: `${memberId}`,
            },
          },
        })
        .query({ token: 'afd' });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });

      const responseAfter = await request(app.getHttpServer()).get(
        `/api/members/${memberId}`,
      );
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
    });
  });

  it('爱发电Webhook返回成功 address_phone', async () => {
    const memberId = 200000101;
    const month = 3;
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
            remark: '',
            redeem_id: '',
            product_type: 0,
            discount: '0.00',
            sku_detail: [],
            address_person: '',
            address_phone: `${memberId}`,
            address_address: '123456',
          },
        },
      })
      .query({ token: 'afd' });
    expect(responseCreate.status).toEqual(201);
    expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });

    const responseAfter = await request(app.getHttpServer()).get(
      `/api/members/${memberId}`,
    );
    expect(responseAfter.status).toEqual(200);
    expect(responseAfter.body).toEqual(expectBodyJson);
  });

  it('爱发电Webhook返回成功 address_person', async () => {
    const memberId = 200000102;
    const month = 6;
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
            remark: '',
            redeem_id: '',
            product_type: 0,
            discount: '0.00',
            sku_detail: [],
            address_person: `${memberId}`,
            address_phone: '12345678901',
            address_address: '1234567',
          },
        },
      })
      .query({ token: 'afd' });
    expect(responseCreate.status).toEqual(201);
    expect(responseCreate.body).toEqual({ ec: 200, em: 'ok' });

    const responseAfter = await request(app.getHttpServer()).get(
      `/api/members/${memberId}`,
    );
    expect(responseAfter.status).toEqual(200);
    expect(responseAfter.body).toEqual(expectBodyJson);
  });

  it('爱发电Webhook返回成功 remark', async () => {
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

    const responseAfter = await request(app.getHttpServer()).get(
      `/api/members/${memberId}`,
    );
    expect(responseAfter.status).toEqual(200);
    expect(responseAfter.body).toEqual(expectBodyJson);
  });

  it('爱发电Webhook开通失败 信息不全', async () => {
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
      ec: 400,
      em: '未能正确获取Dota2 ID，请联系我手动处理。',
    });

    const responseAfter = await request(app.getHttpServer()).get(
      `/api/members/${memberId}`,
    );
    expect(responseAfter.status).toEqual(404);
  });
  afterAll(async () => {
    await app.close();
  });
});