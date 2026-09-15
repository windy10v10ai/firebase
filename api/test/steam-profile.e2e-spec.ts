import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { SteamProfileApiService } from '../src/steam-profile/steam-profile.api.service';

import { createIdTokenForSteamId } from './util/util-auth';
import { getLocalApiKey, initTest } from './util/util-http';

const steamProfileUrl = (steamId: number) => `/api/player/${steamId}/steam-profile`;

function getWithBearer(app: INestApplication, url: string, idToken: string): request.Test {
  return request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${idToken}`);
}

describe('SteamProfileController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
    // 不打真的 Steam：这里验的是路由、鉴权与查不到时的响应形状
    jest.spyOn(app.get(SteamProfileApiService), 'fetchPlayerSummary').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Steam 查不到时返回 200 与空字段，而不是 404', async () => {
    const steamId = 200000901;
    const idToken = await createIdTokenForSteamId(steamId);

    const response = await getWithBearer(app, steamProfileUrl(steamId), idToken).expect(200);

    expect(response.body).toEqual({
      steamId: `${steamId}`,
      personaName: null,
      avatarUrl: null,
    });
  });

  it('拿 A 的 token 请求 B 的资料，返回 403', async () => {
    const idTokenA = await createIdTokenForSteamId(200000902);

    await getWithBearer(app, steamProfileUrl(200000903), idTokenA).expect(403);
  });

  it('本地主机那条 key 调不到这条接口', async () => {
    await request(app.getHttpServer())
      .get(steamProfileUrl(200000904))
      .set('x-api-key', getLocalApiKey())
      .expect(401);
  });
});
