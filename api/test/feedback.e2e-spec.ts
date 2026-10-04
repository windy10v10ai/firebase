import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { initTest } from './util/util-http';

describe('Feedback (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterAll(async () => {
    await app.close();
  });

  it('不带 key 也能提交，提建议缺描述时拒绝', async () => {
    const send = (body: object) => request(app.getHttpServer()).post('/api/feedback').send(body);
    const base = { topics: ['hero', 'balance'], steamId: 300000101, launcherVersion: '0.4.2' };

    await send({ ...base, type: 'problem', mode: 'solo' }).expect(204);
    await send({ ...base, type: 'suggestion' }).expect(400);
    await send({ ...base, type: 'problem', topics: ['hero', 'item', 'bot'] }).expect(400);
  });
});
