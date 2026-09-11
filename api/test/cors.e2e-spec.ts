import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { initTest } from './util/util-http';

const ALLOWED_ORIGIN = 'http://localhost:3000';
const DENIED_ORIGIN = 'https://not-in-whitelist.example.com';

describe('CORS (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  it('白名单内的预检请求返回 204，允许 Authorization 头', () => {
    return request(app.getHttpServer())
      .options('/api/player/ranking')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization')
      .expect(204)
      .expect((res) => {
        expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
        expect(res.headers['access-control-allow-headers'].toLowerCase()).toContain(
          'authorization',
        );
        // 没有 Vary: Origin，CDN 会把某个来源的预检响应复用给其他来源
        expect(res.headers['vary']).toContain('Origin');
      });
  });

  it('白名单外的来源不返回 CORS 头', () => {
    return request(app.getHttpServer())
      .options('/api/player/ranking')
      .set('Origin', DENIED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .expect((res) => {
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      });
  });

  it('鉴权失败的响应仍带 CORS 头，浏览器才能读到错误体', () => {
    return request(app.getHttpServer())
      .get('/api/player/ranking')
      .set('Origin', ALLOWED_ORIGIN)
      .expect(401)
      .expect((res) => {
        expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      });
  });

  it('不带 Origin 的请求（游戏客户端）不受影响', () => {
    return request(app.getHttpServer())
      .get('/api/')
      .expect(200)
      .expect((res) => {
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      });
  });
});
