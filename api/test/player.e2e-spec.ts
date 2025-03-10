import { INestApplication } from '@nestjs/common';

import { get, initTest, patch } from './util/util-http';

describe('PlayerController (e2e)', () => {
  const playerGetUrl = '/api/player/steamId/';
  const playerPatchUrl = '/api/player/steamId/';
  const playerRankUrl = '/api/player/rank';
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  describe(`${playerGetUrl}:steamId (Get)`, () => {
    it('获取不存在的玩家应返回空数据', async () => {
      const result = await get(app, `${playerGetUrl}300009999`);
      expect(result.body.steamId).toBeUndefined();
    });
  });

  describe(`${playerPatchUrl}:steamId (Patch)`, () => {
    it('创建新玩家并更新积分', async () => {
      // 创建新玩家（默认积分为0）
      await patch(app, `${playerPatchUrl}300000001`, {});
      const result = await get(app, `${playerGetUrl}300000001`);
      expect(result.status).toEqual(200);
      expect(result.body.id).toEqual('300000001');
      expect(result.body.memberPointTotal).toEqual(0);
      expect(result.body.seasonPointTotal).toEqual(0);

      // 为玩家追加积分
      await patch(app, `${playerPatchUrl}300000001`, {
        memberPointTotal: 100,
        seasonPointTotal: 200,
      }).expect(200);
      const result2 = await get(app, `${playerGetUrl}300000001`);
      expect(result2.status).toEqual(200);
      expect(result2.body.id).toEqual('300000001');
      expect(result2.body.memberPointTotal).toEqual(100);
      expect(result2.body.seasonPointTotal).toEqual(200);
    });

    it('创建玩家时直接指定初始积分', async () => {
      await patch(app, `${playerPatchUrl}300000002`, {
        memberPointTotal: 100,
        seasonPointTotal: 200,
      }).expect(200);
      const result = await get(app, `${playerGetUrl}300000002`);
      expect(result.status).toEqual(200);
      expect(result.body.id).toEqual('300000002');
      expect(result.body.memberPointTotal).toEqual(100);
      expect(result.body.seasonPointTotal).toEqual(200);
    });
  });

  describe(`${playerRankUrl} (Get)`, () => {
    const testPlayerA = 300400001;
    const testPlayerB = 300400002;

    beforeEach(async () => {
      // 创建两个测试玩家并设置较高的赛季积分以确保他们出现在排行榜中
      await patch(app, `${playerPatchUrl}${testPlayerA}`, {
        seasonPointTotal: 10000,
      }).expect(200);
      await patch(app, `${playerPatchUrl}${testPlayerB}`, {
        seasonPointTotal: 9000,
      }).expect(200);
    });

    it('首次请求计算排名，二次请求返回缓存数据', async () => {
      // 首次请求：计算并保存排名
      const firstResponse = await get(app, playerRankUrl);
      expect(firstResponse.status).toEqual(200);
      expect(firstResponse.body.id).toBeDefined();
      expect(Array.isArray(firstResponse.body.rankSteamIds)).toBeTruthy();

      // 保存响应数据用于比较
      const initialRankData = firstResponse.body;

      // 二次请求：应该使用数据库中的缓存数据
      const secondResponse = await get(app, playerRankUrl);
      expect(secondResponse.status).toEqual(200);
      expect(secondResponse.body.id).toBeDefined();
      expect(Array.isArray(secondResponse.body.rankSteamIds)).toBeTruthy();

      // 两次响应应完全相同，因为第二次请求使用了缓存数据
      expect(secondResponse.body).toEqual(initialRankData);

      // 验证测试玩家是否出现在排行榜中
      expect(secondResponse.body.rankSteamIds).toContain(testPlayerA.toString());
      expect(secondResponse.body.rankSteamIds).toContain(testPlayerB.toString());
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
