import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { SteamProfileApiService } from '../src/steam-profile/steam-profile.api.service';

import { createIdTokenForSteamId } from './util/util-auth';
import { initTest, mockDate, restoreDate } from './util/util-http';
import { createPlayer } from './util/util-player';

describe('PlayerController (e2e)', () => {
  const playerRankUrl = '/api/player/ranking';
  const testPlayerA = 300800001;
  const testPlayerB = 300800002;
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
    // 积分给到远高于其他用例的种子玩家，保证两人稳居榜首
    await createPlayer(app, { steamId: testPlayerA, seasonPointTotal: 90_000_000 });
    await createPlayer(app, { steamId: testPlayerB, seasonPointTotal: 80_000_000 });
  });

  afterAll(async () => {
    await app.close();
  });

  describe(`${playerRankUrl} (Get)`, () => {
    beforeAll(() => {
      jest
        .spyOn(app.get(SteamProfileApiService), 'fetchPlayerSummaries')
        .mockResolvedValue(
          new Map([[testPlayerA, { personaName: 'Alice', avatarUrl: 'https://avatar/a.jpg' }]]),
        );
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it('不带凭据可读，带昵称头像与缓存头，当天第二次读快照', async () => {
      // 快照按天存，锁定一个其他用例不用的日期
      mockDate('2020-07-01T00:00:00.000Z');
      const first = await request(app.getHttpServer()).get(playerRankUrl).expect(200);
      const second = await request(app.getHttpServer()).get(playerRankUrl).expect(200);
      restoreDate();

      expect(first.headers['cache-control']).toBe('public, max-age=600');
      expect(first.body.date).toBe('20200701');
      expect(first.body.players.slice(0, 2)).toEqual([
        { steamId: `${testPlayerA}`, personaName: 'Alice', avatarUrl: 'https://avatar/a.jpg' },
        { steamId: `${testPlayerB}`, personaName: null, avatarUrl: null },
      ]);
      expect(second.body).toEqual(first.body);
      expect(app.get(SteamProfileApiService).fetchPlayerSummaries).toHaveBeenCalledTimes(1);
    });
  });

  describe('/api/player/:steamId/ranking (Get)', () => {
    it('网站读自己的实时名次', async () => {
      const idToken = await createIdTokenForSteamId(testPlayerB);

      const response = await request(app.getHttpServer())
        .get(`/api/player/${testPlayerB}/ranking`)
        .set('Authorization', `Bearer ${idToken}`)
        .expect(200);

      expect(response.body).toEqual({ rank: 2 });
    });
  });
});
