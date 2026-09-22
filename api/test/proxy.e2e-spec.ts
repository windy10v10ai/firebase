import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { getLocalApiKey, initTest } from './util/util-http';
import { createPlayer, getPlayer, getPlayerStatsLifetime } from './util/util-player';

const NEW_PLAYER_STEAM_ID = 310030001;

function decodeProxyTitle(html: string): { requestId: string; data: string } {
  const match = html.match(/<title>(.*)\|(.*)<\/title>/);
  if (!match) throw new Error(`unexpected proxy html: ${html}`);
  return { requestId: match[1], data: match[2] };
}

describe('ProxyController (e2e)', () => {
  let app: INestApplication;
  const localKey = getLocalApiKey();

  beforeAll(async () => {
    app = await initTest();
  });

  afterAll(async () => {
    await app.close();
  });

  it('player-info 查无此人时按成功处理，不返回 ERR:not_found', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/proxy/player-info')
      .query({ requestId: 'p_1_1', steamId: NEW_PLAYER_STEAM_ID, apiKey: localKey });

    expect(res.status).toBe(200);
    const { data } = decodeProxyTitle(res.text);
    expect(data).not.toContain('ERR:');
    expect(JSON.parse(data)).toEqual({});
  });

  it('requestId 非法字符时返回 ERR:bad_request', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/proxy/player-info')
      .query({ requestId: 'bad|id', steamId: NEW_PLAYER_STEAM_ID, apiKey: localKey });

    expect(res.status).toBe(200);
    expect(res.text).toContain('ERR:bad_request');
  });

  describe('daily-task', () => {
    const steamId = 310030003;
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

    it('daily-task 只回 history；daily-task-refresh-post 解出 body 并走原校验', async () => {
      const history = await request(app.getHttpServer())
        .get('/api/proxy/daily-task')
        .query({ requestId: 'p_3_1', steamId, apiKey: localKey });
      expect(JSON.parse(decodeProxyTitle(history.text).data)).toEqual({ steamId, history: [] });

      const dayId = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const refreshed = await request(app.getHttpServer())
        .get('/api/proxy/daily-task-refresh-post')
        .query({ requestId: 'p_3_2', body: encode({ steamId, dayId }), apiKey: localKey });
      const snapshot = JSON.parse(decodeProxyTitle(refreshed.text).data);
      expect(snapshot).toMatchObject({ steamId, dayId, refreshRemaining: 0 });
      expect(snapshot).not.toHaveProperty('history');

      const invalid = await request(app.getHttpServer())
        .get('/api/proxy/daily-task-refresh-post')
        .query({ requestId: 'p_3_3', body: encode({ steamId, dayId: 'bad' }), apiKey: localKey });
      expect(invalid.text).toContain('ERR:bad_request');
    });
  });

  describe('game-end-local-post', () => {
    const steamId = 310030002;
    const payload = {
      matchId: '9200000001',
      version: 'v4.05',
      difficulty: 5,
      winnerTeamId: 2,
      gameTimeMsec: 900000,
      playerCount: 1,
      gameOptions: {
        multiplierRadiant: 1,
        multiplierDire: 1,
        playerNumberRadiant: 1,
        playerNumberDire: 1,
        towerPowerPct: 100,
      },
      players: [
        {
          heroName: 'npc_dota_hero_medusa',
          steamId,
          teamId: 2,
          isDisconnected: false,
          level: 20,
          totalGoldEarned: 10000,
          kills: 5,
          deaths: 3,
          assists: 2,
          score: 10,
          battlePoints: 200,
          lastHits: 50,
          heroDamage: 5000,
          damageTaken: 1000,
          healing: 0,
          towerKills: 1,
        },
      ],
    };
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

    it('单玩家结算：积分与生涯统计入账，标题里带 recorded', async () => {
      await createPlayer(app, { steamId, matchCount: 20 });

      const res = await request(app.getHttpServer())
        .get('/api/proxy/game-end-local-post')
        .query({ requestId: 'p_2_1', body: encode(payload), apiKey: localKey });

      expect(res.status).toBe(200);
      const { requestId, data } = decodeProxyTitle(res.text);
      expect(requestId).toBe('p_2_1');
      expect(JSON.parse(data)).toEqual({ recorded: true });
      const player = await getPlayer(app, steamId);
      expect(player.seasonPointTotal).toBe(200);
      expect((await getPlayerStatsLifetime(app, steamId))?.kills).toBe(5);
    });

    it('报文里不是恰好一个玩家时返回 ERR:bad_request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/proxy/game-end-local-post')
        .query({
          requestId: 'p_2_2',
          body: encode({ ...payload, players: [...payload.players, ...payload.players] }),
          apiKey: localKey,
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('ERR:bad_request');
    });
  });
});
