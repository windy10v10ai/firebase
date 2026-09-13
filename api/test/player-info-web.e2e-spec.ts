import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createIdTokenForSteamId } from './util/util-auth';
import { get, initTest } from './util/util-http';
import { createPlayer } from './util/util-player';

const infoUrl = (steamId: number) => `/api/player/${steamId}/info`;

function getWithBearer(app: INestApplication, url: string, idToken: string): request.Test {
  return request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${idToken}`);
}

describe('PlayerInfoController 网站来源 (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterAll(async () => {
    await app.close();
  });

  it('带自己的 ID Token 能读到自己的数据', async () => {
    const steamId = 200000801;
    await createPlayer(app, { steamId, seasonPointTotal: 100 });
    const idToken = await createIdTokenForSteamId(steamId);

    const response = await getWithBearer(app, infoUrl(steamId), idToken).expect(200);

    expect(response.body.id).toBe(`${steamId}`);
  });

  it('拿 A 的 token 请求 B 的数据，返回 403', async () => {
    const steamIdA = 200000802;
    const steamIdB = 200000803;
    await createPlayer(app, { steamId: steamIdB, seasonPointTotal: 100 });
    const idTokenA = await createIdTokenForSteamId(steamIdA);

    await getWithBearer(app, infoUrl(steamIdB), idTokenA).expect(403);
  });

  it('token 无效，返回 401', async () => {
    await getWithBearer(app, infoUrl(200000804), 'not-a-real-token').expect(401);
  });

  it('走 x-api-key 的既有用例不受影响', async () => {
    const steamId = 200000805;
    await createPlayer(app, { steamId, seasonPointTotal: 100 });

    const response = await get(app, infoUrl(steamId)).expect(200);

    expect(response.body.id).toBe(`${steamId}`);
  });
});
