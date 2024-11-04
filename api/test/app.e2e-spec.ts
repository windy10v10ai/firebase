import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { initTest } from './util/util-http';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  it('/api/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/')
      .expect(200)
      .expect((s) => expect(s.text).toContain('local'));
  });

  afterAll(async () => {
    await app.close();
  });
});
