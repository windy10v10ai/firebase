import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { getLocalApiKey, initTest, mockDate, restoreDate } from './util/util-http';
import { createPlayer } from './util/util-player';

const STEAM_ID = 310010001;
const GAME_START_STEAM_ID = 310010002;
const DAILY_TASK_STEAM_ID = 310010003;

describe('本地 key 放行名单 (e2e)', () => {
  let app: INestApplication;
  const localKey = getLocalApiKey();

  beforeAll(async () => {
    app = await initTest();
    await createPlayer(app, {
      steamId: STEAM_ID,
      seasonPointTotal: 5000,
      memberPointTotal: 5000,
      matchCount: 20,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('放行的接口不返回 401', () => {
    it('GET /api/player/ranking', async () => {
      // 排名接口按天缓存，锁定一个和其他用例不同的日期，避免抢到同一份缓存
      mockDate('2020-06-01T00:00:00.000Z');
      const res = await request(app.getHttpServer())
        .get('/api/player/ranking')
        .set('x-api-key', localKey);
      restoreDate();
      expect(res.status).toBe(200);
    });

    it('GET /api/player/:steamId/info', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/player/${STEAM_ID}/info`)
        .set('x-api-key', localKey);
      expect(res.status).toBe(200);
    });

    it('PUT /api/player/:id/setting', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/player/${STEAM_ID}/setting`)
        .set('x-api-key', localKey)
        .send({ isRememberAbilityKey: true, activeAbilityKey: 'Q' });
      expect(res.status).toBe(200);
    });

    it('PUT /api/player/:id/game-preset', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/player/${STEAM_ID}/game-preset`)
        .set('x-api-key', localKey)
        .send({ map: 'dota', remember: true, difficulty: 3 });
      expect(res.status).toBe(200);
    });

    it('GET /api/game/start', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/game/start')
        .query({ steamIds: `${GAME_START_STEAM_ID}`, matchId: 1, version: 'v4.05' })
        .set('x-api-key', localKey);
      expect(res.status).toBe(200);
      expect(res.body.ga4Config.serverType).toBe('LOCAL');
    });

    it('POST /api/daily-task/refresh', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/daily-task/refresh')
        .set('x-api-key', localKey)
        .send({ steamId: DAILY_TASK_STEAM_ID, dayId: '20260909' });
      expect(res.status).toBe(201);
    });
  });

  describe('未放行的接口返回 401', () => {
    it('PUT /api/player/:steamId/property', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/player/${STEAM_ID}/property`)
        .set('x-api-key', localKey)
        .send({});
      expect(res.status).toBe(401);
    });

    it('DELETE /api/player/:steamId/property', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/player/${STEAM_ID}/property`)
        .set('x-api-key', localKey)
        .query({ useMemberPoint: false });
      expect(res.status).toBe(401);
    });

    it('PUT /api/player/:steamId/hero-awakening', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/player/${STEAM_ID}/hero-awakening`)
        .set('x-api-key', localKey)
        .send({});
      expect(res.status).toBe(401);
    });

    it('PUT /api/player/:steamId/hero-awakening/random', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/player/${STEAM_ID}/hero-awakening/random`)
        .set('x-api-key', localKey)
        .send({});
      expect(res.status).toBe(401);
    });

    it('POST /api/player/conduct', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/player/conduct')
        .set('x-api-key', localKey)
        .send({});
      expect(res.status).toBe(401);
    });
  });

  it('未知 key 打开局接口返回 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/game/start')
      .query({ steamIds: `${STEAM_ID}`, matchId: 1, version: 'v4.05' })
      .set('x-api-key', 'not-a-real-key');
    expect(res.status).toBe(401);
  });
});
