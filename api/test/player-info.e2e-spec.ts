import { INestApplication } from '@nestjs/common';

import { del, get, initTest, mockDate, post, put, restoreDate } from './util/util-http';
import { addPlayerProperty, createPlayer, getPlayerDto } from './util/util-player';

const getPlayerInfoUrl = '/api/player';
const upgradePlayerPropertyUrl = '/api/player/property';

// 验证 PlayerDto 包含所有计算字段
function expectPlayerDtoHasComputedFields(playerDto: Record<string, unknown>): void {
  expect(playerDto.seasonLevel).toBeDefined();
  expect(playerDto.seasonNextLevelPoint).toBeDefined();
  expect(playerDto.useableSeasonPoint).toBeDefined();
  expect(playerDto.memberLevel).toBeDefined();
  expect(playerDto.memberNextLevelPoint).toBeDefined();
  expect(playerDto.useableMemberPoint).toBeDefined();
  expect(playerDto.totalLevel).toBeDefined();
  expect(playerDto.useableLevel).toBeDefined();
  expect(playerDto.properties).toBeDefined();
}

describe('PlayerInfoController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterEach(() => {
    restoreDate();
  });

  describe('GET /api/player/:steamId/info 获取玩家信息', () => {
    it('获取已存在玩家 include=property,setting 返回完整PlayerInfoDto', async () => {
      const steamId = 200000601;
      mockDate('2023-12-01T00:00:00.000Z');
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 300,
        memberPointTotal: 100,
      });

      // 添加一些属性
      await addPlayerProperty(app, steamId, 'property_cooldown_percentage', 1);

      const result = await get(app, `${getPlayerInfoUrl}/${steamId}/info`, {
        include: 'property,setting',
      });

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
      // member 未请求，不返回
      expect(playerDto.member).toBeUndefined();
    });

    it('include=member 会员玩家 返回 member 字段', async () => {
      const steamId = 200000602;
      mockDate('2023-12-01T00:00:00.000Z');
      await createPlayer(app, { steamId, seasonPointTotal: 0, memberPointTotal: 0 });
      await post(app, '/api/members/', { steamId, month: 1, level: 'NORMAL' });

      const result = await get(app, `${getPlayerInfoUrl}/${steamId}/info`, { include: 'member' });

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.member).toBeDefined();
      expect(playerDto.member.steamId).toEqual(steamId);
      expect(playerDto.member.enable).toBe(true);
      // property/setting 未请求，不返回
      expect(playerDto.properties).toBeUndefined();
      expect(playerDto.playerSetting).toBeUndefined();
    });

    it('include= 空 只返回核心字段', async () => {
      const steamId = 200000603;
      mockDate('2023-12-01T00:00:00.000Z');
      await createPlayer(app, { steamId, seasonPointTotal: 100, memberPointTotal: 0 });

      const result = await get(app, `${getPlayerInfoUrl}/${steamId}/info`);

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.id).toEqual(steamId.toString());
      expect(playerDto.seasonLevel).toBeDefined();
      expect(playerDto.properties).toBeUndefined();
      expect(playerDto.playerSetting).toBeUndefined();
      expect(playerDto.member).toBeUndefined();
    });

    it('获取不存在的玩家 返回404', async () => {
      const steamId = 200000699;

      const result = await get(app, `${getPlayerInfoUrl}/${steamId}/info`, {
        include: 'property,setting',
      });

      expect(result.status).toEqual(404);
    });

    it('验证PlayerInfoDto计算字段正确性', async () => {
      const steamId = 200000612;
      mockDate('2023-12-01T00:00:00.000Z');
      // 500分 = level 3 (getSeasonTotalPoint(3)=300, getSeasonTotalPoint(4)=600)
      // 会员100分 = level 1
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 500,
        memberPointTotal: 100,
      });

      const result = await get(app, `${getPlayerInfoUrl}/${steamId}/info`);

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.seasonLevel).toEqual(3);
      expect(playerDto.seasonNextLevelPoint).toEqual(300); // 100 * 3 = 300
      expect(playerDto.useableSeasonPoint).toEqual(500); // 500 - getSeasonTotalPoint(0) = 500
      expect(playerDto.memberLevel).toEqual(1);
      expect(playerDto.useableMemberPoint).toEqual(100); // 100 - getMemberTotalPoint(1) = 100
      expect(playerDto.totalLevel).toEqual(4); // 3 + 1 = 4
      expect(playerDto.useableLevel).toEqual(4); // 没有使用任何属性
    });
  });

  describe('PUT /api/player/property 升级玩家属性', () => {
    beforeEach(() => {
      mockDate('2023-12-01T00:00:00.000Z');
    });

    it('添加玩家属性 返回更新后的PlayerInfoDto (含 member, property, setting)', async () => {
      const steamId = 200000501;
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
      // 验证返回的 PlayerInfoDto 结构
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
      // property upgrade 不返回 member
      expect(playerDto.member).toBeUndefined();
    });

    it('添加多个不同属性', async () => {
      const steamId = 200000502;
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

    it.each([
      ['添加属性 level=1 剩余 useableLevel=2', 200000514, 1, 2, 1, 2, 1],
      ['添加属性 level=3 刚好用尽属性点', 200000515, 3, 2, 1, 0, 3],
    ])(
      '%s',
      async (
        _,
        steamId,
        level,
        expectedSeasonLevel,
        expectedMemberLevel,
        expectedUseableLevel,
        expectedPropertyLevel,
      ) => {
        // 创建玩家 100分 = level 2 (根据公式 getSeasonLevelBuyPoint(100) = 2)
        // memberPointTotal 0分 = memberLevel 1 (根据公式 getMemberLevelBuyPoint(0) = 1)
        await createPlayer(app, {
          steamId,
          seasonPointTotal: 100,
          memberPointTotal: 0,
        });

        const result = await put(app, upgradePlayerPropertyUrl, {
          steamId,
          name: 'property_cooldown_percentage',
          level,
        });

        expect(result.status).toEqual(200);
        const playerDto = result.body;
        expect(playerDto.seasonLevel).toEqual(expectedSeasonLevel);
        expect(playerDto.memberLevel).toEqual(expectedMemberLevel);
        expect(playerDto.totalLevel).toEqual(3); // seasonLevel 2 + memberLevel 1 = 3
        expect(playerDto.useableLevel).toEqual(expectedUseableLevel);
        const property = playerDto.properties.find(
          (p: { name: string }) => p.name === 'property_cooldown_percentage',
        );
        expect(property).toBeDefined();
        expect(property.level).toEqual(expectedPropertyLevel);
      },
    );

    it('分两次添加同一属性刚好用尽属性点应该成功', async () => {
      const steamId = 200000517;
      // 创建玩家 100分 = level 2, 0分 = memberLevel 1, totalLevel = 3
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 100,
        memberPointTotal: 0,
      });

      // 第一次添加属性 level = 1
      const firstResult = await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 1,
      });

      expect(firstResult.status).toEqual(200);
      const firstPlayerDto = firstResult.body;
      expect(firstPlayerDto.totalLevel).toEqual(3);
      expect(firstPlayerDto.useableLevel).toEqual(2); // 3 - 1 = 2

      // 第二次添加同一属性到 level = 3，刚好用尽剩余点数
      const secondResult = await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 3, // 从 level 1 升级到 level 3，增加 2 点，刚好用尽
      });

      expect(secondResult.status).toEqual(200);
      const secondPlayerDto = secondResult.body;
      expect(secondPlayerDto.totalLevel).toEqual(3);
      expect(secondPlayerDto.useableLevel).toEqual(0); // 3 - 3 = 0，刚好用尽
      const property = secondPlayerDto.properties.find(
        (p: { name: string }) => p.name === 'property_cooldown_percentage',
      );
      expect(property).toBeDefined();
      expect(property.level).toEqual(3);
    });

    it.each([
      [
        '点数用尽时添加属性应报错',
        200000518,
        [
          { name: 'property_cooldown_percentage', level: 3 }, // 先用尽
        ],
        { name: 'property_attackspeed_bonus_constant', level: 1 }, // 再添加应该报错
      ],
      [
        '一开始就添加超过上限的属性应报错',
        200000516,
        [], // 没有前置操作
        { name: 'property_cooldown_percentage', level: 4 }, // 直接添加超过上限
      ],
    ])('%s', async (_, steamId, setupProperties, errorProperty) => {
      // 创建玩家 100分 = level 2, 0分 = memberLevel 1, totalLevel = 3
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 100,
        memberPointTotal: 0,
      });

      // 执行前置操作（如果有）
      for (const prop of setupProperties) {
        const firstResult = await put(app, upgradePlayerPropertyUrl, {
          steamId,
          name: prop.name,
          level: prop.level,
        });
        expect(firstResult.status).toEqual(200);
        const firstPlayerDto = firstResult.body;
        expect(firstPlayerDto.totalLevel).toEqual(3);
        expect(firstPlayerDto.useableLevel).toEqual(0); // 3 - 3 = 0，点数已用尽
      }

      // 尝试添加应该报错的属性
      const result = await put(app, upgradePlayerPropertyUrl, {
        steamId,
        name: errorProperty.name,
        level: errorProperty.level,
      });

      expect(result.status).toEqual(400);
    });
  });

  describe('DELETE /api/player/:steamId/property 重置玩家属性', () => {
    describe('可以重置', () => {
      it.each([
        [
          '使用勇士积分重置 level2',
          {
            steamId: 200000402,
            useMemberPoint: false,
            before: { seasonPointTotal: 200, memberPointTotal: 0 },
            after: { seasonPointTotal: 0, memberPointTotal: 0 },
          },
        ],
        [
          '使用勇士积分重置 level3',
          {
            steamId: 200000403,
            useMemberPoint: false,
            before: { seasonPointTotal: 300, memberPointTotal: 1000 },
            after: { seasonPointTotal: 0, memberPointTotal: 1000 },
          },
        ],
        [
          '使用会员积分，重置',
          {
            steamId: 200000412,
            useMemberPoint: true,
            before: { seasonPointTotal: 0, memberPointTotal: 1000 },
            after: { seasonPointTotal: 0, memberPointTotal: 0 },
          },
        ],
        [
          '使用会员积分，重置',
          {
            steamId: 200000413,
            useMemberPoint: true,
            before: { seasonPointTotal: 999, memberPointTotal: 2000 },
            after: { seasonPointTotal: 999, memberPointTotal: 1000 },
          },
        ],
      ])('%s', async (_, { steamId, useMemberPoint, before, after }) => {
        await createPlayer(app, {
          steamId,
          seasonPointTotal: before.seasonPointTotal,
          memberPointTotal: before.memberPointTotal,
        });

        await addPlayerProperty(app, steamId, 'property_cooldown_percentage', 1);

        const result = await del(app, `${getPlayerInfoUrl}/${steamId}/property`, {
          useMemberPoint,
        });
        expect(result.status).toEqual(200);

        const player = result.body;
        expect(player?.seasonPointTotal).toEqual(after.seasonPointTotal);
        expect(player?.memberPointTotal).toEqual(after.memberPointTotal);
        expect(player?.properties).toHaveLength(0);
        expect(player?.member).toBeUndefined();
      });
    });

    describe('无法重置', () => {
      // 不存在的玩家
      it.each([
        { steamId: 200000421, useMemberPoint: false },
        { steamId: 200000422, useMemberPoint: true },
      ])('不存在的玩家应返回400', async ({ steamId, useMemberPoint }) => {
        const result = await del(app, `${getPlayerInfoUrl}/${steamId}/property`, {
          useMemberPoint,
        });
        expect(result.status).toEqual(400);
      });

      // 积分不足
      it.each([
        [
          '使用勇士积分，积分不足',
          {
            steamId: 200000401,
            useMemberPoint: false,
            before: { seasonPointTotal: 199, memberPointTotal: 0 },
            after: { seasonPointTotal: 199, memberPointTotal: 0 },
          },
        ],
        [
          '使用会员积分，积分不足',
          {
            steamId: 200000411,
            useMemberPoint: true,
            before: { seasonPointTotal: 0, memberPointTotal: 999 },
            after: { seasonPointTotal: 0, memberPointTotal: 999 },
          },
        ],
      ])('%s', async (_, { steamId, useMemberPoint, before, after }) => {
        await createPlayer(app, {
          steamId,
          seasonPointTotal: before.seasonPointTotal,
          memberPointTotal: before.memberPointTotal,
        });

        await addPlayerProperty(app, steamId, 'property_cooldown_percentage', 1);

        const result = await del(app, `${getPlayerInfoUrl}/${steamId}/property`, {
          useMemberPoint,
        });
        expect(result.status).toEqual(400);

        const playerDto = await getPlayerDto(app, steamId);
        expect(playerDto.seasonPointTotal).toEqual(after.seasonPointTotal);
        expect(playerDto.memberPointTotal).toEqual(after.memberPointTotal);
        expect(playerDto.properties).toHaveLength(1);
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
