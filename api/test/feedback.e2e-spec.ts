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

  it('游戏来源不用带启动器版本，启动器来源仍要带', async () => {
    const send = (body: object) => request(app.getHttpServer()).post('/api/feedback').send(body);
    const base = { type: 'problem', topics: ['game'], steamId: 300000102 };

    await send({
      ...base,
      source: 'game',
      gameState: {
        gameTimeMsec: 600000,
        playerCount: 2,
        difficulty: 8,
        gameOptions: { multiplierRadiant: 2, multiplierDire: 3, towerPowerPct: 100 },
        heroName: 'npc_dota_hero_axe',
        items: ['item_blink', '', '', '', '', ''],
        abilities: ['axe_berserkers_call'],
        localHost: true,
        offline: false,
      },
    }).expect(204);
    await send({ ...base, source: 'game', gameState: { items: Array(7).fill('') } }).expect(400);
    await send({ ...base, source: 'game', gameState: { difficulty: 9 } }).expect(400);
    await send({ ...base, source: 'launcher' }).expect(400);
    await send({ ...base, source: 'web' }).expect(400);
  });
});
