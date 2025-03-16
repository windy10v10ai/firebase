import { INestApplication } from '@nestjs/common';

import { get, initTest } from './util/util-http';
import { createPlayer } from './util/util-player';

describe('PlayerController (e2e)', () => {
  const playerRankUrl = '/api/player/ranking';
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  describe(`${playerRankUrl} (Get)`, () => {
    const testPlayerA = 300400001;
    const testPlayerB = 300400002;

    beforeEach(async () => {
      // 创建两个测试玩家并设置较高的勇士积分以确保他们出现在排行榜中
      await createPlayer(app, {
        steamId: testPlayerA,
        seasonPointTotal: 10000,
      });
      await createPlayer(app, {
        steamId: testPlayerB,
        seasonPointTotal: 9000,
      });
    });

    it('首次请求计算排名，二次请求返回缓存数据', async () => {
      // 首次请求：计算并保存排名
      const firstResponse = await get(app, playerRankUrl);
      expect(firstResponse.status).toEqual(200);
      expect(firstResponse.body.id).toBeDefined();
      expect(Array.isArray(firstResponse.body.topSteamIds)).toBeTruthy();
      expect(firstResponse.body.rankScores).toBeDefined();

      // 保存响应数据用于比较
      const initialRankData = firstResponse.body;

      // 二次请求：应该使用数据库中的缓存数据
      const secondResponse = await get(app, playerRankUrl);
      expect(secondResponse.status).toEqual(200);
      expect(secondResponse.body.id).toBeDefined();
      expect(Array.isArray(secondResponse.body.topSteamIds)).toBeTruthy();

      // 两次响应应完全相同，因为第二次请求使用了缓存数据
      expect(secondResponse.body).toEqual(initialRankData);

      // 验证测试玩家是否出现在排行榜中
      expect(secondResponse.body.topSteamIds).toContain(testPlayerA.toString());
      expect(secondResponse.body.topSteamIds).toContain(testPlayerB.toString());
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
