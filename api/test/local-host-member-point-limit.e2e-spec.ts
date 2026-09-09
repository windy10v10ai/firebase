import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { getLocalApiKey, getTestApiKey, initTest } from './util/util-http';
import { createPlayer } from './util/util-player';

const useUrl = '/api/player/member-points/use';
const STEAM_IDS = {
  SINGLE_CAP: 310020001,
  DAILY_CAP: 310020002,
  OFFICIAL_NOT_LIMITED: 310020003,
} as const;

describe('本地 key 会员积分限额 (e2e)', () => {
  let app: INestApplication;
  const localKey = getLocalApiKey();

  beforeAll(async () => {
    app = await initTest();
    for (const steamId of Object.values(STEAM_IDS)) {
      await createPlayer(app, { steamId, memberPointTotal: 5000 });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('单笔 51 被拒', async () => {
    const res = await request(app.getHttpServer())
      .post(useUrl)
      .set('x-api-key', localKey)
      .send({ steamId: STEAM_IDS.SINGLE_CAP, memberPoint: 51, reason: 'lottery' });

    expect(res.status).toBe(400);
  });

  it('当日累计到 1000 后再消耗被拒', async () => {
    const steamId = STEAM_IDS.DAILY_CAP;
    for (let i = 0; i < 20; i++) {
      const ok = await request(app.getHttpServer())
        .post(useUrl)
        .set('x-api-key', localKey)
        .send({ steamId, memberPoint: 50, reason: 'lottery' });
      expect(ok.status).toBe(201);
    }

    const rejected = await request(app.getHttpServer())
      .post(useUrl)
      .set('x-api-key', localKey)
      .send({ steamId, memberPoint: 1, reason: 'lottery' });

    expect(rejected.status).toBe(400);
  });

  it('官方 key 不受限额约束', async () => {
    const res = await request(app.getHttpServer())
      .post(useUrl)
      .set('x-api-key', getTestApiKey())
      .send({ steamId: STEAM_IDS.OFFICIAL_NOT_LIMITED, memberPoint: 200, reason: 'lottery' });

    expect(res.status).toBe(201);
  });
});
