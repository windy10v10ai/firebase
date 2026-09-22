import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { SteamProfileApiService } from '../src/steam-profile/steam-profile.api.service';

import { createIdTokenForSteamId } from './util/util-auth';
import { initTest } from './util/util-http';

// 归属校验与 key 类型是 auth.guard.ts 对所有路由的通用行为，已在 player-info-web.e2e-spec.ts
// 验过一次，这里只验这条路由自己的事：接得通，且 Steam 给不出结果时不是错误响应
describe('SteamProfileController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
    jest.spyOn(app.get(SteamProfileApiService), 'fetchPlayerSummary').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Steam 查不到时返回 200 与空字段，而不是 404', async () => {
    const steamId = 300700001;
    const idToken = await createIdTokenForSteamId(steamId);

    const response = await request(app.getHttpServer())
      .get(`/api/player/${steamId}/steam-profile`)
      .set('Authorization', `Bearer ${idToken}`)
      .expect(200);

    expect(response.body).toEqual({
      steamId: `${steamId}`,
      personaName: null,
      avatarUrl: null,
    });
  });
});
