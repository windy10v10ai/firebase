import { INestApplication } from '@nestjs/common';

import { del, get, initTest, mockDate, post, put, restoreDate } from './util/util-http';
import { addPlayerProperty, awakenHero, createPlayer, getPlayerDto } from './util/util-player';

const getPlayerInfoUrl = '/api/player';
const upgradePlayerPropertyUrl = (steamId: number) => `/api/player/${steamId}/property`;
const useMemberPointUrl = '/api/player/member-points/use';

// 验证 PlayerDto 包含所有计算字段
function expectPlayerDtoHasComputedFields(playerDto: Record<string, unknown>): void {
  expect(playerDto.seasonLevel).toBeDefined();
  expect(playerDto.seasonCurrrentLevelPoint).toBeDefined();
  expect(playerDto.seasonNextLevelPoint).toBeDefined();
  expect(playerDto.useableSeasonPoint).toBeDefined();
  expect(playerDto.memberLevel).toBeDefined();
  expect(playerDto.memberCurrentLevelPoint).toBeDefined();
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
      expect(playerDto.seasonCurrrentLevelPoint).toEqual(200); // 500 - 300 = 200
      expect(playerDto.seasonNextLevelPoint).toEqual(300); // 100 * 3 = 300
      expect(playerDto.useableSeasonPoint).toEqual(500); // 500 - getSeasonTotalPoint(0) = 500
      expect(playerDto.memberLevel).toEqual(1);
      expect(playerDto.useableMemberPoint).toEqual(100); // 100 - getMemberTotalPoint(1) = 100
      expect(playerDto.totalLevel).toEqual(4); // 3 + 1 = 4
      expect(playerDto.useableLevel).toEqual(4); // 没有使用任何属性
    });

    describe('可用积分计算', () => {
      it('新用户没有积分', async () => {
        const steamId = 200000631;
        mockDate('2023-12-01T00:00:00.000Z');
        await createPlayer(app, { steamId, seasonPointTotal: 0, memberPointTotal: 0 });

        const result = await get(app, `${getPlayerInfoUrl}/${steamId}/info`);

        expect(result.status).toEqual(200);
        expect(result.body.seasonPointTotal).toEqual(0);
        expect(result.body.useableSeasonPoint).toEqual(0);
        expect(result.body.memberPointTotal).toEqual(0);
        expect(result.body.useableMemberPoint).toEqual(0);
      });

      it('有积分未消耗时可用积分等于总积分，消耗会员积分后相应减少', async () => {
        const steamId = 200000632;
        mockDate('2023-12-01T00:00:00.000Z');
        await createPlayer(app, {
          steamId,
          seasonPointTotal: 500,
          memberPointTotal: 100,
        });

        const beforeResult = await get(app, `${getPlayerInfoUrl}/${steamId}/info`);
        expect(beforeResult.status).toEqual(200);
        expect(beforeResult.body.seasonPointTotal).toEqual(500);
        expect(beforeResult.body.useableSeasonPoint).toEqual(500);
        expect(beforeResult.body.memberPointTotal).toEqual(100);
        expect(beforeResult.body.useableMemberPoint).toEqual(100);

        const useResult = await post(app, useMemberPointUrl, {
          steamId,
          memberPoint: 25,
          reason: 'e2e-test',
        });
        expect(useResult.status).toEqual(201);
        expect(useResult.body.memberPointTotal).toEqual(100);
        expect(useResult.body.usedMemberPoint).toEqual(25);
        expect(useResult.body.useableMemberPoint).toEqual(75);
        expect(useResult.body.useableSeasonPoint).toEqual(500);

        const afterResult = await get(app, `${getPlayerInfoUrl}/${steamId}/info`);
        expect(afterResult.status).toEqual(200);
        expect(afterResult.body.memberPointTotal).toEqual(100);
        expect(afterResult.body.usedMemberPoint).toEqual(25);
        expect(afterResult.body.useableMemberPoint).toEqual(75);
        expect(afterResult.body.useableSeasonPoint).toEqual(500);
      });

      it('消耗会员积分必须至少为 1', async () => {
        const steamId = 200000633;
        await createPlayer(app, { steamId, memberPointTotal: 100 });

        const result = await post(app, useMemberPointUrl, {
          steamId,
          memberPoint: 0,
          reason: 'e2e-test',
        });

        expect(result.status).toEqual(400);
      });
    });
  });

  describe('PUT /api/player/:steamId/property 升级玩家属性', () => {
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
      const result = await put(app, upgradePlayerPropertyUrl(steamId), {
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
      await put(app, upgradePlayerPropertyUrl(steamId), {
        name: 'property_cooldown_percentage',
        level: 1,
      });

      // 添加第二个属性
      const result = await put(app, upgradePlayerPropertyUrl(steamId), {
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
      await put(app, upgradePlayerPropertyUrl(steamId), {
        name: 'property_cooldown_percentage',
        level: 2,
      });

      // 第二次升级同一属性
      const result = await put(app, upgradePlayerPropertyUrl(steamId), {
        name: 'property_cooldown_percentage',
        level: 3,
      });

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.properties).toHaveLength(1);
      expect(playerDto.properties[0].level).toEqual(3); // 更新为新的 level 值
    });

    it.each([
      [
        '添加属性 level=1 剩余 useableLevel=2',
        {
          steamId: 200000514,
          seasonPointTotal: 100,
          memberPointTotal: 0,
          level: 1,
          expected: {
            seasonLevel: 2,
            memberLevel: 1,
            totalLevel: 3,
            useableLevel: 2,
            propertyLevel: 1,
            useableSeasonPoint: 100,
            useableMemberPoint: 0,
          },
        },
      ],
      [
        '添加属性 level=3 刚好用尽属性点',
        {
          steamId: 200000515,
          seasonPointTotal: 100,
          memberPointTotal: 0,
          level: 3,
          expected: {
            seasonLevel: 2,
            memberLevel: 1,
            totalLevel: 3,
            useableLevel: 0,
            propertyLevel: 3,
            useableSeasonPoint: 100,
            useableMemberPoint: 0,
          },
        },
      ],
      [
        '属性升级不影响 useableSeasonPoint',
        {
          steamId: 200000621,
          seasonPointTotal: 300,
          memberPointTotal: 0,
          level: 2,
          expected: {
            seasonLevel: 3,
            memberLevel: 1,
            totalLevel: 4,
            useableLevel: 2,
            propertyLevel: 2,
            useableSeasonPoint: 300,
            useableMemberPoint: 0,
          },
        },
      ],
      [
        '属性升级不影响 useableMemberPoint',
        {
          steamId: 200000622,
          seasonPointTotal: 300,
          memberPointTotal: 2050,
          level: 5,
          expected: {
            seasonLevel: 3,
            memberLevel: 3,
            totalLevel: 6,
            useableLevel: 1,
            propertyLevel: 5,
            useableSeasonPoint: 300,
            useableMemberPoint: 2050,
          },
        },
      ],
    ])('%s', async (_, { steamId, seasonPointTotal, memberPointTotal, level, expected }) => {
      await createPlayer(app, { steamId, seasonPointTotal, memberPointTotal });

      const result = await put(app, upgradePlayerPropertyUrl(steamId), {
        name: 'property_cooldown_percentage',
        level,
      });

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.seasonLevel).toEqual(expected.seasonLevel);
      expect(playerDto.memberLevel).toEqual(expected.memberLevel);
      expect(playerDto.totalLevel).toEqual(expected.totalLevel);
      expect(playerDto.useableLevel).toEqual(expected.useableLevel);
      expect(playerDto.useableSeasonPoint).toEqual(expected.useableSeasonPoint);
      expect(playerDto.useableMemberPoint).toEqual(expected.useableMemberPoint);
      const property = playerDto.properties.find(
        (p: { name: string }) => p.name === 'property_cooldown_percentage',
      );
      expect(property).toBeDefined();
      expect(property.level).toEqual(expected.propertyLevel);
    });

    it('分两次添加同一属性刚好用尽属性点应该成功', async () => {
      const steamId = 200000517;
      // 创建玩家 100分 = level 2, 0分 = memberLevel 1, totalLevel = 3
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 100,
        memberPointTotal: 0,
      });

      // 第一次添加属性 level = 1
      const firstResult = await put(app, upgradePlayerPropertyUrl(steamId), {
        name: 'property_cooldown_percentage',
        level: 1,
      });

      expect(firstResult.status).toEqual(200);
      const firstPlayerDto = firstResult.body;
      expect(firstPlayerDto.totalLevel).toEqual(3);
      expect(firstPlayerDto.useableLevel).toEqual(2); // 3 - 1 = 2

      // 第二次添加同一属性到 level = 3，刚好用尽剩余点数
      const secondResult = await put(app, upgradePlayerPropertyUrl(steamId), {
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
        const firstResult = await put(app, upgradePlayerPropertyUrl(steamId), {
          name: prop.name,
          level: prop.level,
        });
        expect(firstResult.status).toEqual(200);
        const firstPlayerDto = firstResult.body;
        expect(firstPlayerDto.totalLevel).toEqual(3);
        expect(firstPlayerDto.useableLevel).toEqual(0); // 3 - 3 = 0，点数已用尽
      }

      // 尝试添加应该报错的属性
      const result = await put(app, upgradePlayerPropertyUrl(steamId), {
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
            before: {
              seasonPointTotal: 200,
              memberPointTotal: 0,
              usedSeasonPoint: 0,
              usedMemberPoint: 0,
            },
            after: {
              seasonPointTotal: 200,
              memberPointTotal: 0,
              usedSeasonPoint: 200,
              usedMemberPoint: 0,
              useableSeasonPoint: 0,
              useableMemberPoint: 0,
            },
          },
        ],
        [
          '使用勇士积分重置 level3',
          {
            steamId: 200000403,
            useMemberPoint: false,
            before: {
              seasonPointTotal: 300,
              memberPointTotal: 1000,
              usedSeasonPoint: 0,
              usedMemberPoint: 0,
            },
            after: {
              seasonPointTotal: 300,
              memberPointTotal: 1000,
              usedSeasonPoint: 300,
              usedMemberPoint: 0,
              useableSeasonPoint: 0,
              useableMemberPoint: 1000,
            },
          },
        ],
        [
          '使用会员积分，重置',
          {
            steamId: 200000412,
            useMemberPoint: true,
            before: {
              seasonPointTotal: 0,
              memberPointTotal: 1000,
              usedSeasonPoint: 0,
              usedMemberPoint: 0,
            },
            after: {
              seasonPointTotal: 0,
              memberPointTotal: 1000,
              usedSeasonPoint: 0,
              usedMemberPoint: 1000,
              useableSeasonPoint: 0,
              useableMemberPoint: 0,
            },
          },
        ],
        [
          '使用会员积分，重置（总积分充足但已用部分积分）',
          {
            steamId: 200000413,
            useMemberPoint: true,
            before: {
              seasonPointTotal: 999,
              memberPointTotal: 2000,
              usedSeasonPoint: 0,
              usedMemberPoint: 500,
            },
            after: {
              seasonPointTotal: 999,
              memberPointTotal: 2000,
              usedSeasonPoint: 0,
              usedMemberPoint: 1500,
              useableSeasonPoint: 999,
              useableMemberPoint: 500,
            },
          },
        ],
      ])('%s', async (_, { steamId, useMemberPoint, before, after }) => {
        await createPlayer(app, {
          steamId,
          seasonPointTotal: before.seasonPointTotal,
          memberPointTotal: before.memberPointTotal,
          usedSeasonPoint: before.usedSeasonPoint,
          usedMemberPoint: before.usedMemberPoint,
        });

        await addPlayerProperty(app, steamId, 'property_cooldown_percentage', 1);

        const result = await del(app, `${getPlayerInfoUrl}/${steamId}/property`, {
          useMemberPoint,
        });
        expect(result.status).toEqual(200);

        const player = result.body;
        expect(player?.seasonPointTotal).toEqual(after.seasonPointTotal);
        expect(player?.memberPointTotal).toEqual(after.memberPointTotal);
        expect(player?.usedSeasonPoint ?? 0).toEqual(after.usedSeasonPoint);
        expect(player?.usedMemberPoint ?? 0).toEqual(after.usedMemberPoint);
        expect(player?.useableSeasonPoint).toEqual(after.useableSeasonPoint);
        expect(player?.useableMemberPoint).toEqual(after.useableMemberPoint);
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

      // 可用积分不足
      it.each([
        [
          '使用勇士积分，总积分充足但可用积分不足',
          {
            steamId: 200000401,
            useMemberPoint: false,
            before: {
              seasonPointTotal: 200,
              memberPointTotal: 0,
              usedSeasonPoint: 1,
              usedMemberPoint: 0,
            },
            after: {
              seasonPointTotal: 200,
              memberPointTotal: 0,
              usedSeasonPoint: 1,
              usedMemberPoint: 0,
              useableSeasonPoint: 199,
              useableMemberPoint: 0,
            },
          },
        ],
        [
          '使用会员积分，总积分充足但可用积分不足',
          {
            steamId: 200000411,
            useMemberPoint: true,
            before: {
              seasonPointTotal: 0,
              memberPointTotal: 1000,
              usedSeasonPoint: 0,
              usedMemberPoint: 1,
            },
            after: {
              seasonPointTotal: 0,
              memberPointTotal: 1000,
              usedSeasonPoint: 0,
              usedMemberPoint: 1,
              useableSeasonPoint: 0,
              useableMemberPoint: 999,
            },
          },
        ],
      ])('%s', async (_, { steamId, useMemberPoint, before, after }) => {
        await createPlayer(app, {
          steamId,
          seasonPointTotal: before.seasonPointTotal,
          memberPointTotal: before.memberPointTotal,
          usedSeasonPoint: before.usedSeasonPoint,
          usedMemberPoint: before.usedMemberPoint,
        });

        await addPlayerProperty(app, steamId, 'property_cooldown_percentage', 1);

        const result = await del(app, `${getPlayerInfoUrl}/${steamId}/property`, {
          useMemberPoint,
        });
        expect(result.status).toEqual(400);

        const playerDto = await getPlayerDto(app, steamId);
        expect(playerDto.seasonPointTotal).toEqual(after.seasonPointTotal);
        expect(playerDto.memberPointTotal).toEqual(after.memberPointTotal);
        expect(playerDto.usedSeasonPoint ?? 0).toEqual(after.usedSeasonPoint);
        expect(playerDto.usedMemberPoint ?? 0).toEqual(after.usedMemberPoint);
        expect(playerDto.useableSeasonPoint).toEqual(after.useableSeasonPoint);
        expect(playerDto.useableMemberPoint).toEqual(after.useableMemberPoint);
        expect(playerDto.properties).toHaveLength(1);
      });
    });
  });

  describe('PUT /api/player/:steamId/hero-awakening 觉醒英雄', () => {
    const validHeroName = 'npc_dota_hero_axe';

    it('使用赛季积分觉醒成功，返回 awakenedHeroes 且不含积分字段', async () => {
      const steamId = 200000701;
      await createPlayer(app, { steamId, seasonPointTotal: 10000, memberPointTotal: 0 });

      const result = await awakenHero(app, steamId, validHeroName, false);

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.awakenedHeroes).toHaveLength(1);
      expect(playerDto.awakenedHeroes[0].heroName).toEqual(validHeroName);
      expect(playerDto.awakenedHeroes[0].usedSeasonPoint).toBeUndefined();
      expect(playerDto.awakenedHeroes[0].usedMemberPoint).toBeUndefined();
      expect(playerDto.useableSeasonPoint).toEqual(0);
    });

    it('使用会员积分觉醒成功，消耗 5000', async () => {
      const steamId = 200000702;
      await createPlayer(app, { steamId, seasonPointTotal: 0, memberPointTotal: 5000 });

      const result = await awakenHero(app, steamId, validHeroName, true);

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.awakenedHeroes).toHaveLength(1);
      expect(playerDto.useableMemberPoint).toEqual(0);
    });

    it.each([
      [
        '赛季积分总数不足',
        200000711,
        {
          useMemberPoint: false,
          seasonPointTotal: 9999,
          memberPointTotal: 0,
          usedSeasonPoint: 0,
          usedMemberPoint: 0,
        },
      ],
      [
        '赛季总积分充足但可用积分不足（已使用部分积分）',
        200000712,
        {
          useMemberPoint: false,
          seasonPointTotal: 10000,
          memberPointTotal: 0,
          usedSeasonPoint: 1,
          usedMemberPoint: 0,
        },
      ],
      [
        '会员积分总数不足',
        200000713,
        {
          useMemberPoint: true,
          seasonPointTotal: 0,
          memberPointTotal: 4999,
          usedSeasonPoint: 0,
          usedMemberPoint: 0,
        },
      ],
      [
        '会员总积分充足但可用积分不足（已使用部分积分）',
        200000714,
        {
          useMemberPoint: true,
          seasonPointTotal: 0,
          memberPointTotal: 5000,
          usedSeasonPoint: 0,
          usedMemberPoint: 1,
        },
      ],
    ])('%s应返回400，且不产生副作用', async (_, steamId, params) => {
      await createPlayer(app, { steamId, ...params });

      const result = await awakenHero(app, steamId, validHeroName, params.useMemberPoint);

      expect(result.status).toEqual(400);

      // 验证失败后没有副作用：未扣分、未写入 awakenedHeroes
      const playerDto = await getPlayerDto(app, steamId);
      expect(playerDto.seasonPointTotal).toEqual(params.seasonPointTotal);
      expect(playerDto.memberPointTotal).toEqual(params.memberPointTotal);
      expect(playerDto.usedSeasonPoint ?? 0).toEqual(params.usedSeasonPoint ?? 0);
      expect(playerDto.usedMemberPoint ?? 0).toEqual(params.usedMemberPoint ?? 0);
    });

    it('无效英雄名应返回400', async () => {
      const steamId = 200000704;
      await createPlayer(app, { steamId, seasonPointTotal: 10000, memberPointTotal: 0 });

      const result = await awakenHero(app, steamId, 'not_a_real_hero', false);

      expect(result.status).toEqual(400);
    });

    it('重复觉醒同一英雄应 no-op 成功并返回200', async () => {
      const steamId = 200000705;
      await createPlayer(app, { steamId, seasonPointTotal: 20000, memberPointTotal: 0 });

      const firstResult = await awakenHero(app, steamId, validHeroName, false);
      expect(firstResult.status).toEqual(200);

      const secondResult = await awakenHero(app, steamId, validHeroName, false);
      expect(secondResult.status).toEqual(200);
    });

    it('觉醒不同英雄分别成功累加到 awakenedHeroes', async () => {
      const steamId = 200000706;
      await createPlayer(app, { steamId, seasonPointTotal: 20000, memberPointTotal: 0 });

      await awakenHero(app, steamId, 'npc_dota_hero_axe', false);
      const result = await awakenHero(app, steamId, 'npc_dota_hero_abaddon', false);

      expect(result.status).toEqual(200);
      const heroNames = result.body.awakenedHeroes.map((h: { heroName: string }) => h.heroName);
      expect(heroNames).toContain('npc_dota_hero_axe');
      expect(heroNames).toContain('npc_dota_hero_abaddon');
    });

    it('不存在的玩家应返回400', async () => {
      const steamId = 200000799;

      const result = await awakenHero(app, steamId, validHeroName, false);

      expect(result.status).toEqual(400);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
