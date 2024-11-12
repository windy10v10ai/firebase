import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { initTest } from './util/util-http';

describe('MemberController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
    // 初始化测试数据
    await request(app.getHttpServer()).get('/api/test/init');
  });

  describe('members/ (GET)', () => {
    it('获取不存在的会员 return 404', () => {
      return request(app.getHttpServer())
        .get('/api/members/987654321')
        .expect(404);
    });
    it('获取存在已过期的会员 return 200 and enable false', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/members/20200801',
      );
      expect(response.status).toEqual(200);
      expect(response.body).toEqual({
        steamId: 20200801,
        expireDateString: '2020-08-01',
        enable: false,
      });
    });
    it('获取存在且有效的会员 return 200 and enable true', async () => {
      const response = await request(app.getHttpServer()).get(
        '/api/members/20300801',
      );
      expect(response.status).toEqual(200);
      expect(response.body).toEqual({
        steamId: 20300801,
        expireDateString: '2030-08-01',
        enable: true,
      });
    });
  });

  describe('members/ (POST)', () => {
    it('开通一个月会员 新建 检测会员数据储存是否一致', async () => {
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(
        new Date().getUTCDate() + +process.env.DAYS_PER_MONTH,
      );
      const expectBodyJson = {
        steamId: 123456789,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
      };

      const responseBefore = await request(app.getHttpServer()).get(
        '/api/members/123456789',
      );
      expect(responseBefore.status).toEqual(404);

      const responseCreate = await request(app.getHttpServer())
        .post('/api/members')
        .send({
          steamId: 123456789,
          month: 1,
        });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);

      const responseAfter = await request(app.getHttpServer()).get(
        '/api/members/123456789',
      );
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
    });

    it('开通一个月会员 有效期过去 检测会员数据储存是否一致', async () => {
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(
        new Date().getUTCDate() + +process.env.DAYS_PER_MONTH,
      );
      const expectBodyJson = {
        steamId: 20201231,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
      };

      const responseBefore = await request(app.getHttpServer()).get(
        '/api/members/20201231',
      );
      expect(responseBefore.status).toEqual(200);

      const responseCreate = await request(app.getHttpServer())
        .post('/api/members')
        .send({
          steamId: 20201231,
          month: 1,
        });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);

      const responseAfter = await request(app.getHttpServer()).get(
        '/api/members/20201231',
      );
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
    });

    it('开通一个月会员 有效期在未来 检测会员数据储存是否一致', async () => {
      const expectBodyJson = {
        steamId: 20301231,
        expireDateString: '2031-01-31',
        enable: true,
      };

      const responseBefore = await request(app.getHttpServer()).get(
        '/api/members/20301231',
      );
      expect(responseBefore.status).toEqual(200);

      const responseCreate = await request(app.getHttpServer())
        .post('/api/members')
        .send({
          steamId: 20301231,
          month: 1,
        });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);

      const responseAfter = await request(app.getHttpServer()).get(
        '/api/members/20301231',
      );
      expect(responseAfter.status).toEqual(200);
      expect(responseAfter.body).toEqual(expectBodyJson);
    });
    it('开通复数月会员 新建', async () => {
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(
        new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * 13,
      );
      const expectBodyJson = {
        steamId: 1234567890,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
      };

      const responseCreate = await request(app.getHttpServer())
        .post('/api/members')
        .send({
          steamId: 1234567890,
          month: 13,
        });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);
    });
    it('开通复数月会员 有效期在过去', async () => {
      const dateNextMonth = new Date();
      dateNextMonth.setUTCDate(
        new Date().getUTCDate() + +process.env.DAYS_PER_MONTH * 3,
      );
      const expectBodyJson = {
        steamId: 20200801,
        expireDateString: dateNextMonth.toISOString().split('T')[0],
        enable: true,
      };

      const responseCreate = await request(app.getHttpServer())
        .post('/api/members')
        .send({
          steamId: 20200801,
          month: 3,
        });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);
    });
    it('开通复数月会员 有效期在未来', async () => {
      const expectBodyJson = {
        steamId: 20300801,
        expireDateString: '2031-08-08',
        enable: true,
      };

      const responseCreate = await request(app.getHttpServer())
        .post('/api/members')
        .send({
          steamId: 20300801,
          month: 12,
        });
      expect(responseCreate.status).toEqual(201);
      expect(responseCreate.body).toEqual(expectBodyJson);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
