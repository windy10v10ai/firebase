import { INestApplication } from '@nestjs/common';

import { get, initTest, mockDate, post, put, restoreDate } from './util/util-http';
import { addPlayerProperty, createPlayer, getPlayerDto } from './util/util-player';

const getPlayerInfoUrl = '/api/player';
const upgradePlayerPropertyUrl = '/api/player/property';
const resetPlayerPropertyUrl = '/api/player/property/reset';

// 验证 PlayerDto 包含所有计算字段
function expectPlayerDtoHasComputedFields(playerDto: Record<string, unknown>): void {
  expect(playerDto.seasonLevel).toBeDefined();
  expect(playerDto.seasonCurrrentLevelPoint).toBeDefined();
  expect(playerDto.seasonNextLevelPoint).toBeDefined();
  expect(playerDto.memberLevel).toBeDefined();
  expect(playerDto.memberCurrentLevelPoint).toBeDefined();
  expect(playerDto.memberNextLevelPoint).toBeDefined();
  expect(playerDto.totalLevel).toBeDefined();
  expect(playerDto.useableLevel).toBeDefined();
  expect(playerDto.properties).toBeDefined();
  expect(playerDto.playerSetting).toBeDefined();
}

describe('PlayerInfoController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterEach(() => {
    restoreDate();
  });

  describe('GET /api/player/:steamId 获取玩家信息', () => {
    it('获取已存在玩家 返回完整PlayerDto', async () => {
      const steamId = 200000601;
      mockDate('2023-12-01T00:00:00.000Z');
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 300,
        memberPointTotal: 100,
      });

      // 添加一些属性
      await addPlayerProperty(app, steamId, 'property_cooldown_percentage', 1);

      const result = await get(app, `${getPlayerInfoUrl}/${steamId}`);

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      // 基础字段
      expect(playerDto.id).toEqual(steamId.toString());
      expect(playerDto.seasonPointTotal).toEqual(300);
      expect(playerDto.memberPointTotal).toEqual(100);
      expect(playerDto.seasonLevel).toEqual(3);
      // 计算字段
      expectPlayerDtoHasComputedFields(playerDto);
      // 属性
      expect(playerDto.properties).toHaveLength(1);
      expect(playerDto.properties[0].name).toEqual('property_cooldown_percentage');
    });

    it('获取不存在的玩家 返回空对象', async () => {
      const steamId = 200000699;

      const result = await get(app, `${getPlayerInfoUrl}/${steamId}`);

      expect(result.status).toEqual(200);
      // 不存在的玩家返回空对象
      expect(result.body).toEqual({});
    });

    it('验证PlayerDto计算字段正确性', async () => {
      const steamId = 200000612;
      mockDate('2023-12-01T00:00:00.000Z');
      // 500分 = level 3 (getSeasonTotalPoint(3)=300, getSeasonTotalPoint(4)=600)
      // 会员100分 = level 1
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 500,
        memberPointTotal: 100,
      });

      const result = await get(app, `${getPlayerInfoUrl}/${steamId}`);

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.seasonLevel).toEqual(3);
      expect(playerDto.seasonCurrrentLevelPoint).toEqual(200); // 500 - 300 = 200
      expect(playerDto.seasonNextLevelPoint).toEqual(300); // 100 * 3 = 300
      expect(playerDto.memberLevel).toEqual(1);
      expect(playerDto.totalLevel).toEqual(4); // 3 + 1 = 4
      expect(playerDto.useableLevel).toEqual(4); // 没有使用任何属性
    });
  });

  describe('PUT /api/player/property 升级玩家属性', () => {
    it('添加玩家属性 返回更新后的PlayerDto', async () => {
      const steamId = 200000501;
      mockDate('2023-12-01T00:00:00.000Z');
      // 先创建玩家
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 500,
        memberPointTotal: 200,
      });

      // 添加属性
      const result = await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 2,
      });

      expect(result.status).toEqual(200);
      // 验证返回的 PlayerDto 结构
      const playerDto = result.body;
      expect(playerDto.id).toEqual(steamId.toString());
      expect(playerDto.seasonPointTotal).toEqual(500);
      expect(playerDto.memberPointTotal).toEqual(200);
      // 验证计算字段
      expectPlayerDtoHasComputedFields(playerDto);
      // 验证属性
      expect(playerDto.properties).toHaveLength(1);
      expect(playerDto.properties[0].name).toEqual('property_cooldown_percentage');
      expect(playerDto.properties[0].level).toEqual(2);
    });

    it('添加多个不同属性', async () => {
      const steamId = 200000502;
      mockDate('2023-12-01T00:00:00.000Z');
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 1000,
        memberPointTotal: 500,
      });

      // 添加第一个属性
      await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 1,
      });

      // 添加第二个属性
      const result = await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_attackspeed_bonus_constant',
        level: 2,
      });

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.properties).toHaveLength(2);
    });

    it('更新已有属性 level升级', async () => {
      const steamId = 200000503;
      mockDate('2023-12-01T00:00:00.000Z');
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 1000,
        memberPointTotal: 500,
      });

      // 第一次添加属性
      await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 2,
      });

      // 第二次升级同一属性
      const result = await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 3,
      });

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.properties).toHaveLength(1);
      expect(playerDto.properties[0].level).toEqual(3); // 更新为新的 level 值
    });

    it('验证 useableLevel 正确计算', async () => {
      const steamId = 200000514;
      mockDate('2023-12-01T00:00:00.000Z');
      // 创建玩家 100分 = level 2 (根据公式 getSeasonLevelBuyPoint(100) = 2)
      // memberPointTotal 0分 = memberLevel 1 (根据公式 getMemberLevelBuyPoint(0) = 1)
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 100,
        memberPointTotal: 0,
      });

      // 添加属性消耗 1 level
      const result = await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 1,
      });

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.seasonLevel).toEqual(2); // 100分对应 level 2
      expect(playerDto.memberLevel).toEqual(1); // 0分对应 memberLevel 1
      expect(playerDto.totalLevel).toEqual(3); // seasonLevel 2 + memberLevel 1 = 3
      expect(playerDto.useableLevel).toEqual(2); // 3 - 1 = 2
    });

    it('点数用尽时添加属性应报错', async () => {
      const steamId = 200000515;
      mockDate('2023-12-01T00:00:00.000Z');
      // 创建玩家 100分 = level 2, 0分 = memberLevel 1, totalLevel = 3
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 100,
        memberPointTotal: 0,
      });

      // 添加属性消耗所有点数，使 useableLevel = 0
      const firstResult = await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 3,
      });

      expect(firstResult.status).toEqual(200);
      const firstPlayerDto = firstResult.body;
      expect(firstPlayerDto.totalLevel).toEqual(3);
      expect(firstPlayerDto.useableLevel).toEqual(0); // 3 - 3 = 0，点数已用尽

      // 尝试再次添加属性，应该返回 400 错误
      const secondResult = await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_attackspeed_bonus_constant',
        level: 1,
      });

      expect(secondResult.status).toEqual(400);
    });

    it('一开始就添加超过上限的属性应报错', async () => {
      const steamId = 200000516;
      mockDate('2023-12-01T00:00:00.000Z');
      // 创建玩家 100分 = level 2, 0分 = memberLevel 1, totalLevel = 3
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 100,
        memberPointTotal: 0,
      });

      // 一开始就尝试添加超过 totalLevel 的属性，应该返回 400 错误
      const result = await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 4, // totalLevel = 3，尝试添加 level 4 应该报错
      });

      expect(result.status).toEqual(400);
    });
  });

  describe('POST /api/player/property/reset 重置玩家属性', () => {
    describe('可以重置', () => {
      it.each([
        [
          '使用勇士积分重置 level2',
          {
            body: {
              steamId: 200000402,
              useMemberPoint: false,
            },
            before: {
              seasonPointTotal: 200,
              memberPointTotal: 0,
            },
            after: {
              seasonPointTotal: 0,
              memberPointTotal: 0,
            },
            expected: {
              status: 201,
              propertyLength: 0,
            },
          },
        ],
        [
          '使用勇士积分重置 level3',
          {
            body: {
              steamId: 200000403,
              useMemberPoint: false,
            },
            before: {
              seasonPointTotal: 300,
              memberPointTotal: 1000,
            },
            after: {
              seasonPointTotal: 0,
              memberPointTotal: 1000,
            },
            expected: {
              status: 201,
              propertyLength: 0,
            },
          },
        ],
        [
          '使用会员积分，重置',
          {
            body: {
              steamId: 200000412,
              useMemberPoint: true,
            },
            before: {
              seasonPointTotal: 0,
              memberPointTotal: 1000,
            },
            after: {
              seasonPointTotal: 0,
              memberPointTotal: 0,
            },
            expected: {
              status: 201,
              propertyLength: 0,
            },
          },
        ],
        [
          '使用会员积分，重置',
          {
            body: {
              steamId: 200000413,
              useMemberPoint: true,
            },
            before: {
              seasonPointTotal: 999,
              memberPointTotal: 2000,
            },
            after: {
              seasonPointTotal: 999,
              memberPointTotal: 1000,
            },
            expected: {
              status: 201,
              propertyLength: 0,
            },
          },
        ],
      ])('%s', async (_, { body, before, after, expected }) => {
        await createPlayer(app, {
          steamId: body.steamId,
          seasonPointTotal: before.seasonPointTotal,
          memberPointTotal: before.memberPointTotal,
        });

        await addPlayerProperty(app, body.steamId, 'property_cooldown_percentage', 1);

        // 重置玩家属性
        const result = await post(app, resetPlayerPropertyUrl, body);
        expect(result.status).toEqual(expected.status);

        const player = result.body;
        expect(player?.seasonPointTotal).toEqual(after.seasonPointTotal);
        expect(player?.memberPointTotal).toEqual(after.memberPointTotal);
        expect(player?.properties).toHaveLength(expected.propertyLength);
      });
    });

    describe('无法重置', () => {
      // 不存在的玩家
      it.each([
        {
          body: {
            steamId: 200000421,
            useMemberPoint: false,
          },
          status: 400,
        },
        {
          body: {
            steamId: 200000422,
            useMemberPoint: true,
          },
          status: 400,
        },
      ])('不存在的玩家应返回400', async ({ body, status }) => {
        const result = await post(app, resetPlayerPropertyUrl, body);
        expect(result.status).toEqual(status);
      });

      // 积分不足
      it.each([
        [
          '使用勇士积分，积分不足',
          {
            body: {
              steamId: 200000401,
              useMemberPoint: false,
            },
            before: {
              seasonPointTotal: 199,
              memberPointTotal: 0,
            },
            after: {
              seasonPointTotal: 199,
              memberPointTotal: 0,
            },
            expected: {
              status: 400,
              propertyLength: 1,
            },
          },
        ],
        [
          '使用会员积分，积分不足',
          {
            body: {
              steamId: 200000411,
              useMemberPoint: true,
            },
            before: {
              seasonPointTotal: 0,
              memberPointTotal: 999,
            },
            after: {
              seasonPointTotal: 0,
              memberPointTotal: 999,
            },
            expected: {
              status: 400,
              propertyLength: 1,
            },
          },
        ],
      ])('%s', async (_, { body, before, after, expected }) => {
        await createPlayer(app, {
          steamId: body.steamId,
          seasonPointTotal: before.seasonPointTotal,
          memberPointTotal: before.memberPointTotal,
        });

        await addPlayerProperty(app, body.steamId, 'property_cooldown_percentage', 1);

        // 重置玩家属性
        const result = await post(app, resetPlayerPropertyUrl, body);
        expect(result.status).toEqual(expected.status);

        const playerDto = await getPlayerDto(app, body.steamId);
        expect(playerDto.seasonPointTotal).toEqual(after.seasonPointTotal);
        expect(playerDto.memberPointTotal).toEqual(after.memberPointTotal);
        expect(playerDto.properties).toHaveLength(expected.propertyLength);
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
