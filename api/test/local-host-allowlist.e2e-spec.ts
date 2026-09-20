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

    it('GET /api/game/probe 回传边缘给出的国家码', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/game/probe')
        .set('x-api-key', localKey)
        .set('cf-ipcountry', 'CN');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ country: 'CN' });
    });

    it('GET /api/game/probe 边缘没给国家码时不返回该字段', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/game/probe')
        .set('x-api-key', localKey);
      expect(res.status).toBe(200);
      expect(res.body.country).toBeUndefined();
    });

    it('POST /api/daily-task/refresh', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/daily-task/refresh')
        .set('x-api-key', localKey)
        .send({ steamId: DAILY_TASK_STEAM_ID, dayId: '20260909' });
      expect(res.status).toBe(201);
    });

    it('GET /api/proxy/game-start（网页控件无法带请求头，走 query 的 apiKey）', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/proxy/game-start')
        .query({
          requestId: 'p_1_1',
          steamIds: `${GAME_START_STEAM_ID}`,
          matchId: 1,
          apiKey: localKey,
        });
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/^<!DOCTYPE html><title>p_1_1\|/);
      expect(res.text).not.toContain('ERR:');
    });

    it('GET /api/proxy/player-info（网页控件无法带请求头，走 query 的 apiKey）', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/proxy/player-info')
        .query({ requestId: 'p_2_1', steamId: STEAM_ID, apiKey: localKey });
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/^<!DOCTYPE html><title>p_2_1\|/);
      expect(res.text).not.toContain('ERR:');
    });

    it('GET /api/proxy/game-probe（网页控件无法带请求头，走 query 的 apiKey）', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/proxy/game-probe')
        .query({ requestId: 'p_3_1', apiKey: localKey })
        .set('cf-ipcountry', 'CN');
      expect(res.status).toBe(200);
      expect(res.text).toBe('<!DOCTYPE html><title>p_3_1|{"country":"CN"}</title>');
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

  it('代理路由的鉴权失败不返回 401，而是 200 + ERR:unauthorized（网页控件读不到非 200 的 title）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/proxy/game-start')
      .query({ requestId: 'p_1_1', steamIds: `${STEAM_ID}`, matchId: 1, apiKey: 'not-a-real-key' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('<!DOCTYPE html><title>p_1_1|ERR:unauthorized</title>');
  });
});
