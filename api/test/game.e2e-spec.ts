import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { MemberLevel } from '../src/members/entities/members.entity';

import { get, initTest, mockDate, post, put, restoreDate } from './util/util-http';
import { addPlayerProperty, createPlayer, getPlayer } from './util/util-player';

const gameStartUrl = '/api/game/start/';
const gameEndUrl = '/api/game/end';
const memberPostUrl = '/api/members/';
const addPlayerPropertyUrl = '/api/game/addPlayerProperty';

function callGameStart(app: INestApplication, steamIds: number[]): request.Test {
  const apiKey = 'Invalid_NotOnDedicatedServer';
  const countryCode = 'CN';
  const headers = {
    'x-api-key': apiKey,
    'x-country-code': countryCode,
  };

  return request(app.getHttpServer())
    .get(gameStartUrl)
    .query({ steamIds, matchId: 1 })
    .set(headers);
}

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

// 创建 GameEnd 请求体的默认玩家数据
interface GameEndPlayerOptions {
  steamId: number;
  battlePoints?: number;
  teamId?: number;
  isDisconnected?: boolean;
}

function createGameEndPlayer(options: GameEndPlayerOptions) {
  return {
    isDisconnected: options.isDisconnected ?? false,
    score: 10,
    damageTaken: 1000,
    steamId: options.steamId,
    damage: 5000,
    teamId: options.teamId ?? 2,
    level: 20,
    kills: 5,
    deaths: 3,
    assists: 2,
    healing: 0,
    lastHits: 50,
    towerKills: 1,
    gold: 10000,
    battlePoints: options.battlePoints ?? 100,
    heroName: 'npc_dota_hero_medusa',
  };
}

interface GameEndPayloadOptions {
  players?: GameEndPlayerOptions[];
  winnerTeamId?: number;
}

function createGameEndPayload(options: GameEndPayloadOptions = {}) {
  return {
    matchId: '8000000001',
    version: 'v4.05',
    winnerTeamId: options.winnerTeamId ?? 2,
    players: (options.players ?? []).map(createGameEndPlayer),
    gameTimeMsec: 900000,
    gameOptions: {},
    difficulty: 5,
    steamId: 0,
  };
}

describe('PlayerController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterEach(() => {
    restoreDate();
  });

  describe('/api/game/start/ (Get)', () => {
    const matchId = 1;
    describe('单人开始', () => {
      it('普通玩家 新玩家 首次', async () => {
        mockDate('2023-12-01T00:00:00.000Z');
        const steamIds = [100000001];

        const result = await get(app, gameStartUrl, { steamIds, matchId });
        expect(result.status).toEqual(200);
        // assert player
        const player = await getPlayer(app, 100000001);
        expect(player.memberPointTotal).toEqual(0);
        expect(player.seasonPointTotal).toEqual(0);
      });

      it('普通玩家 老玩家 当日首次', async () => {
        const steamIds = [100000002];

        mockDate('2023-12-01T00:00:00.000Z');
        const result = await get(app, gameStartUrl, { steamIds, matchId });
        expect(result.status).toEqual(200);
        // assert player
        const player = await getPlayer(app, 100000002);
        expect(player.memberPointTotal).toEqual(0);
        expect(player.seasonPointTotal).toEqual(0);

        mockDate('2023-12-02T00:00:00.000Z');
        const result2 = await get(app, gameStartUrl, { steamIds, matchId });
        expect(result2.status).toEqual(200);
        // assert player
        const player2 = await getPlayer(app, 100000002);
        expect(player2.memberPointTotal).toEqual(0);
        expect(player2.seasonPointTotal).toEqual(0);
      });

      it.each([
        ['普通会员 新玩家 当日首次', 100000011, MemberLevel.NORMAL],
        ['高级会员 新玩家 当日首次', 100000012, MemberLevel.PREMIUM],
      ])('%s', async (title, steamId, level) => {
        mockDate('2023-12-01T00:00:00.000Z');
        await post(app, memberPostUrl, {
          steamId,
          month: 1,
          level,
        });

        const result = await callGameStart(app, [steamId]);
        expect(result.status).toEqual(200);
        // assert player
        const player = await getPlayer(app, steamId);
        expect(player.memberPointTotal).toEqual(100);
        expect(player.seasonPointTotal).toEqual(0);
      });

      it.each([
        [
          '普通会员 二日首次登录 赋予积分',
          '2023-12-01T00:00:00.000Z',
          100000021,
          '2023-12-01T00:00:00.000Z',
          100,
          '2023-12-02T00:00:00.000Z',
          200,
          MemberLevel.NORMAL,
        ],
        [
          '普通会员 当日第二次 不赋予积分',
          '2023-12-01T00:00:00.000Z',
          100000022,
          '2023-12-01T00:00:00.000Z',
          100,
          '2023-12-01T01:00:00.000Z',
          100,
          MemberLevel.NORMAL,
        ],
        [
          '普通过期后 不赋予积分',
          '2023-10-01T00:00:00.000Z',
          100000023,
          '2023-11-01T00:00:00.000Z',
          100,
          '2023-11-02T01:00:00.000Z',
          100,
          MemberLevel.NORMAL,
        ],
        [
          '高级会员 二日首次登录 赋予积分',
          '2023-12-01T00:00:00.000Z',
          100000024,
          '2023-12-01T00:00:00.000Z',
          100,
          '2023-12-02T00:00:00.000Z',
          200,
          MemberLevel.PREMIUM,
        ],
        [
          '高级会员 当日第二次 不赋予积分',
          '2023-12-01T00:00:00.000Z',
          100000025,
          '2023-12-01T00:00:00.000Z',
          100,
          '2023-12-01T01:00:00.000Z',
          100,
          MemberLevel.PREMIUM,
        ],
        [
          '高级会员 过期后 不赋予积分',
          '2023-10-01T00:00:00.000Z',
          100000026,
          '2023-11-01T00:00:00.000Z',
          100,
          '2023-11-02T01:00:00.000Z',
          100,
          MemberLevel.PREMIUM,
        ],
      ])('%s', async (title, dateMember, steamId, date1, point1, date2, point2, level) => {
        mockDate(dateMember);
        await post(app, memberPostUrl, {
          steamId,
          month: 1,
          level,
        });

        mockDate(date1);
        const result = await get(app, gameStartUrl, {
          steamIds: [steamId],
          matchId,
        });
        expect(result.status).toEqual(200);
        // assert player
        const player = await getPlayer(app, steamId);
        expect(player.memberPointTotal).toEqual(point1);
        expect(player.seasonPointTotal).toEqual(0);

        mockDate(date2);
        const result2 = await get(app, gameStartUrl, {
          steamIds: [steamId],
          matchId,
        });
        expect(result2.status).toEqual(200);
        // assert player
        const player2 = await getPlayer(app, steamId);
        expect(player2.memberPointTotal).toEqual(point2);
        expect(player2.seasonPointTotal).toEqual(0);
      });
    });

    describe('多人开始', () => {
      it('普通玩家 会员 混合', async () => {
        await post(app, memberPostUrl, {
          steamId: 100000032,
          month: 1,
          level: MemberLevel.NORMAL,
        });
        await post(app, memberPostUrl, {
          steamId: 100000033,
          month: 1,
          level: MemberLevel.PREMIUM,
        });

        const steamIds = [100000030, 100000031, 100000032, 100000033];

        const result = await callGameStart(app, steamIds);
        expect(result.status).toEqual(200);
        // assert player
        const player1 = await getPlayer(app, 100000030);
        expect(player1.memberPointTotal).toEqual(0);

        const player2 = await getPlayer(app, 100000031);
        expect(player2.memberPointTotal).toEqual(0);

        const player3 = await getPlayer(app, 100000032);
        expect(player3.memberPointTotal).toEqual(100);

        const player4 = await getPlayer(app, 100000033);
        expect(player4.memberPointTotal).toEqual(100);
      });
    });

    describe('响应体验证', () => {
      it('验证响应体结构完整性 (members, players, pointInfo)', async () => {
        const steamId = 100000701;
        mockDate('2023-12-01T00:00:00.000Z');

        // 创建会员
        await post(app, memberPostUrl, {
          steamId,
          month: 1,
          level: MemberLevel.NORMAL,
        });

        const result = await callGameStart(app, [steamId]);
        expect(result.status).toEqual(200);

        const response = result.body;
        // 验证 members 数组
        expect(response.members).toBeDefined();
        expect(Array.isArray(response.members)).toBe(true);
        expect(response.members.length).toBeGreaterThanOrEqual(1);

        // 验证 players 数组
        expect(response.players).toBeDefined();
        expect(Array.isArray(response.players)).toBe(true);
        expect(response.players.length).toEqual(1);

        // 验证 pointInfo 数组
        expect(response.pointInfo).toBeDefined();
        expect(Array.isArray(response.pointInfo)).toBe(true);
      });

      it('验证 players 包含完整的计算字段', async () => {
        const steamId = 100000702;
        mockDate('2023-12-01T00:00:00.000Z');

        // 先创建玩家并添加积分
        await createPlayer(app, {
          steamId,
          seasonPointTotal: 300,
          memberPointTotal: 200,
        });

        // 添加属性
        await addPlayerProperty(app, steamId, 'property_cooldown_percentage', 1);

        const result = await callGameStart(app, [steamId]);
        expect(result.status).toEqual(200);

        const player = result.body.players.find((p: { id: string }) => p.id === steamId.toString());
        expect(player).toBeDefined();

        // 验证计算字段存在
        expectPlayerDtoHasComputedFields(player);
        expect(player.properties.length).toBeGreaterThanOrEqual(1);
      });

      it('验证 pointInfo 包含正确的会员积分信息', async () => {
        const steamId = 100000703;
        mockDate('2023-12-01T00:00:00.000Z');

        // 创建会员
        await post(app, memberPostUrl, {
          steamId,
          month: 1,
          level: MemberLevel.NORMAL,
        });

        const result = await callGameStart(app, [steamId]);
        expect(result.status).toEqual(200);

        const pointInfo = result.body.pointInfo;
        const memberPointInfo = pointInfo.find((p: { steamId: number }) => p.steamId === steamId);
        expect(memberPointInfo).toBeDefined();
        expect(memberPointInfo.title).toBeDefined();
        expect(memberPointInfo.title.cn).toBeDefined();
        expect(memberPointInfo.title.en).toBeDefined();
        expect(memberPointInfo.memberPoint).toEqual(100);
      });

      it('验证 MemberDto 结构', async () => {
        const steamId = 100000704;
        mockDate('2023-12-01T00:00:00.000Z');

        await post(app, memberPostUrl, {
          steamId,
          month: 1,
          level: MemberLevel.PREMIUM,
        });

        const result = await callGameStart(app, [steamId]);
        expect(result.status).toEqual(200);

        const member = result.body.members.find((m: { steamId: number }) => m.steamId === steamId);
        expect(member).toBeDefined();
        expect(member.steamId).toEqual(steamId);
        expect(member.level).toEqual(MemberLevel.PREMIUM);
        expect(member.expireDateString).toBeDefined();
      });
    });

    describe('边界条件', () => {
      it('steamIds超过10个应返回400', async () => {
        mockDate('2023-12-01T00:00:00.000Z');
        const steamIds = Array.from({ length: 11 }, (_, i) => 200000001 + i);

        const result = await callGameStart(app, steamIds);
        expect(result.status).toEqual(400);
      });

      it('steamIds包含无效值(0或负数)应被过滤', async () => {
        mockDate('2023-12-01T00:00:00.000Z');
        const steamIds = [100000801, 0, -1, 100000802];

        const result = await callGameStart(app, steamIds);
        expect(result.status).toEqual(200);
        // 只有2个有效玩家
        expect(result.body.players).toHaveLength(2);
      });

      it('steamIds刚好10个应正常返回', async () => {
        mockDate('2023-12-01T00:00:00.000Z');
        const steamIds = Array.from({ length: 10 }, (_, i) => 200000101 + i);

        const result = await callGameStart(app, steamIds);
        expect(result.status).toEqual(200);
        expect(result.body.players).toHaveLength(10);
      });

      it('所有steamIds都是无效值应返回400', async () => {
        mockDate('2023-12-01T00:00:00.000Z');
        const steamIds = [0, -1, -100];

        const result = await callGameStart(app, steamIds);
        expect(result.status).toEqual(400);
      });
    });

    describe('事件奖励', () => {
      it('活动期间内首次登录 获得活动积分', async () => {
        const steamId = 100000901;
        // 活动期间: 2026-02-06 ~ 2026-02-23
        mockDate('2026-02-10T00:00:00.000Z');

        const result = await callGameStart(app, [steamId]);
        expect(result.status).toEqual(200);

        // 验证获得了活动积分
        const pointInfo = result.body.pointInfo;
        const eventReward = pointInfo.find(
          (p: { steamId: number; seasonPoint?: number }) => p.steamId === steamId && p.seasonPoint,
        );
        expect(eventReward).toBeDefined();
        expect(eventReward.seasonPoint).toEqual(5000);

        // 验证玩家积分
        const player = await getPlayer(app, steamId);
        expect(player.seasonPointTotal).toEqual(5000);
      });

      it('活动期间内第二次登录 不重复获得积分', async () => {
        const steamId = 100000902;
        mockDate('2026-02-10T00:00:00.000Z');

        // 第一次登录
        await callGameStart(app, [steamId]);
        const player1 = await getPlayer(app, steamId);
        expect(player1.seasonPointTotal).toEqual(5000);

        // 第二次登录
        const result = await callGameStart(app, [steamId]);
        expect(result.status).toEqual(200);

        // 不应该再获得活动积分
        const pointInfo = result.body.pointInfo;
        const eventReward = pointInfo.find(
          (p: { steamId: number; seasonPoint?: number }) => p.steamId === steamId && p.seasonPoint,
        );
        expect(eventReward).toBeUndefined();

        // 积分不变
        const player2 = await getPlayer(app, steamId);
        expect(player2.seasonPointTotal).toEqual(5000);
      });

      it('活动期间外 不获得活动积分', async () => {
        const steamId = 100000903;
        // 活动期间外
        mockDate('2026-02-24T00:00:00.000Z');

        const result = await callGameStart(app, [steamId]);
        expect(result.status).toEqual(200);

        // 不应该获得活动积分
        const pointInfo = result.body.pointInfo;
        const eventReward = pointInfo.find(
          (p: { steamId: number; seasonPoint?: number }) => p.steamId === steamId && p.seasonPoint,
        );
        expect(eventReward).toBeUndefined();

        // 玩家积分为0
        const player = await getPlayer(app, steamId);
        expect(player.seasonPointTotal).toEqual(0);
      });
    });
  });

  describe('/api/game/end (Post) 游戏结算', () => {
    it.each([
      ['单人结算 0分', 100000101, 0, 0],
      ['单人结算 90分', 100000102, 90, 90],
      ['单人结算 累加之前的积分', 100000102, 120, 210],
      ['单人结算 1000分', 100000103, 1000, 1000],
      ['单人结算 超过1000分不记录', 100000104, 1001, 0],
      ['单人结算 低于0分不记录', 100000105, -1, 0],
    ])('%s', async (_title, steamId, inputPoints, expectedPoints) => {
      mockDate('2023-12-01T00:00:00.000Z');
      const result = await post(app, gameEndUrl, {
        matchId: '8000000001',
        version: 'v4.05',
        winnerTeamId: 2,
        players: [
          {
            isDisconnected: false,
            score: 23,
            damageTaken: 25000,
            steamId,
            damage: 280000,
            teamId: 2,
            level: 38,
            kills: 51,
            deaths: 2,
            assists: 0,
            healing: 0,
            lastHits: 200,
            towerKills: 10,
            gold: 20000,
            battlePoints: inputPoints,
            heroName: 'npc_dota_hero_medusa',
          },
          {
            isDisconnected: true,
            score: 2,
            damageTaken: 18949,
            steamId: 0,
            damage: 393,
            teamId: 3,
            level: 24,
            kills: 0,
            deaths: 3,
            assists: 2,
            healing: 0,
            lastHits: 3,
            towerKills: 0,
            gold: 13273,
            battlePoints: 0,
            heroName: 'npc_dota_hero_chaos_knight',
          },
        ],
        gameTimeMsec: 900000,
        gameOptions: {
          multiplierRadiant: 1.5,
          multiplierDire: 8,
          playerNumberRadiant: 1,
          playerNumberDire: 10,
          towerPowerPct: 300,
        },
        difficulty: 5,
        steamId: 0,
      });
      expect(result.status).toEqual(201);
      // assert player
      const player = await getPlayer(app, steamId);
      // 当 battlePoints 无效时（超过1000或低于0），玩家不会被创建或更新
      if (player) {
        expect(player.memberPointTotal).toEqual(0);
        expect(player.seasonPointTotal).toEqual(expectedPoints);
      } else {
        // 玩家不存在，说明积分没有被记录（符合预期）
        expect(expectedPoints).toEqual(0);
      }

      // bot not record
      try {
        await getPlayer(app, 0);
      } catch (error) {
        expect(error.response.body).toStrictEqual({});
      }
    });

    it('多人结算', async () => {
      mockDate('2023-12-01T00:00:00.000Z');
      const steamId1 = 100000111;
      const steamId2 = 100000112;
      const steamId3 = 100000113;
      const points1 = 0;
      const points2 = -1;
      const points3 = 1;
      const result = await post(app, gameEndUrl, {
        matchId: '8000000001',
        version: 'v4.05',
        winnerTeamId: 2,
        players: [
          {
            isDisconnected: false,
            score: 23,
            damageTaken: 25000,
            steamId: steamId1,
            damage: 280000,
            teamId: 2,
            level: 38,
            kills: 51,
            deaths: 2,
            assists: 0,
            healing: 0,
            lastHits: 200,
            towerKills: 10,
            gold: 20000,
            battlePoints: points1,
            heroName: 'npc_dota_hero_medusa',
          },
          {
            isDisconnected: false,
            score: 23,
            damageTaken: 25000,
            steamId: steamId2,
            damage: 280000,
            teamId: 2,
            level: 38,
            kills: 51,
            deaths: 2,
            assists: 0,
            healing: 0,
            lastHits: 200,
            towerKills: 10,
            gold: 20000,
            battlePoints: points2,
            heroName: 'npc_dota_hero_medusa',
          },
          {
            isDisconnected: false,
            score: 23,
            damageTaken: 25000,
            steamId: steamId3,
            damage: 280000,
            teamId: 2,
            level: 38,
            kills: 51,
            deaths: 2,
            assists: 0,
            healing: 0,
            lastHits: 200,
            towerKills: 10,
            gold: 20000,
            battlePoints: points3,
            heroName: 'npc_dota_hero_medusa',
          },
          {
            isDisconnected: true,
            score: 2,
            damageTaken: 18949,
            steamId: 0,
            damage: 393,
            teamId: 3,
            level: 24,
            kills: 0,
            deaths: 3,
            assists: 2,
            healing: 0,
            lastHits: 3,
            towerKills: 0,
            gold: 13273,
            battlePoints: 0,
            heroName: 'npc_dota_hero_chaos_knight',
          },
        ],
        gameTimeMsec: 900000,
        gameOptions: {
          multiplierRadiant: 1.5,
          multiplierDire: 8,
          playerNumberRadiant: 1,
          playerNumberDire: 10,
          towerPowerPct: 300,
        },
        difficulty: 5,
        steamId: 0,
      });
      expect(result.status).toEqual(201);
      // assert player
      const player1 = await getPlayer(app, steamId1);
      expect(player1.memberPointTotal).toEqual(0);
      expect(player1.seasonPointTotal).toEqual(points1);

      // 玩家2负分未记录
      const player2 = await getPlayer(app, steamId2);
      expect(player2).toBeNull();

      const player3 = await getPlayer(app, steamId3);
      expect(player3.memberPointTotal).toEqual(0);
      expect(player3.seasonPointTotal).toEqual(points3);

      // bot not record
      try {
        await getPlayer(app, 0);
      } catch (error) {
        expect(error.response.body).toStrictEqual({});
      }
    });
  });

  describe('Tenvten API Key', () => {
    it('游戏结算 使用 Tenvten API Key 应该返回 201', async () => {
      const headers = {
        'x-api-key': 'tenvten-apikey',
      };
      const result = await request(app.getHttpServer())
        .post(gameEndUrl)
        .send({
          matchId: '8000000001',
          version: 'v4.05',
          winnerTeamId: 2,
          players: [],
          gameTimeMsec: 900000,
          gameOptions: {},
          difficulty: 5,
          steamId: 0,
        })
        .set(headers);
      expect(result.status).toEqual(201);
    });
  });

  describe('/api/game/addPlayerProperty (Put) 添加玩家属性 [DEPRECATED]', () => {
    it('添加玩家属性 返回更新后的PlayerDto', async () => {
      const steamId = 100000501;
      mockDate('2023-12-01T00:00:00.000Z');
      // 先创建玩家
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 500,
        memberPointTotal: 200,
      });

      // 添加属性
      const result = await put(app, addPlayerPropertyUrl, {
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
      const steamId = 100000502;
      mockDate('2023-12-01T00:00:00.000Z');
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 1000,
        memberPointTotal: 500,
      });

      // 添加第一个属性
      await put(app, addPlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 1,
      });

      // 添加第二个属性
      const result = await put(app, addPlayerPropertyUrl, {
        steamId,
        name: 'property_attackspeed_bonus_constant',
        level: 2,
      });

      expect(result.status).toEqual(200);
      const playerDto = result.body;
      expect(playerDto.properties).toHaveLength(2);
    });

    it('更新已有属性 level升级', async () => {
      const steamId = 100000503;
      mockDate('2023-12-01T00:00:00.000Z');
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 1000,
        memberPointTotal: 500,
      });

      // 第一次添加属性
      await put(app, addPlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 2,
      });

      // 第二次升级同一属性
      const result = await put(app, addPlayerPropertyUrl, {
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
      const steamId = 100000514;
      mockDate('2023-12-01T00:00:00.000Z');
      // 创建玩家 100分 = level 2 (根据公式 getSeasonLevelBuyPoint(100) = 2)
      // memberPointTotal 0分 = memberLevel 1 (根据公式 getMemberLevelBuyPoint(0) = 1)
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 100,
        memberPointTotal: 0,
      });

      // 添加属性消耗 1 level
      const result = await put(app, addPlayerPropertyUrl, {
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
      const steamId = 100000515;
      mockDate('2023-12-01T00:00:00.000Z');
      // 创建玩家 100分 = level 2, 0分 = memberLevel 1, totalLevel = 3
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 100,
        memberPointTotal: 0,
      });

      // 添加属性消耗所有点数，使 useableLevel = 0
      const firstResult = await put(app, addPlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 3,
      });

      expect(firstResult.status).toEqual(200);
      const firstPlayerDto = firstResult.body;
      expect(firstPlayerDto.totalLevel).toEqual(3);
      expect(firstPlayerDto.useableLevel).toEqual(0); // 3 - 3 = 0，点数已用尽

      // 尝试再次添加属性，应该返回 400 错误
      const secondResult = await put(app, addPlayerPropertyUrl, {
        steamId,
        name: 'property_attackspeed_bonus_constant',
        level: 1,
      });

      expect(secondResult.status).toEqual(400);
    });

    it('一开始就添加超过上限的属性应报错', async () => {
      const steamId = 100000516;
      mockDate('2023-12-01T00:00:00.000Z');
      // 创建玩家 100分 = level 2, 0分 = memberLevel 1, totalLevel = 3
      await createPlayer(app, {
        steamId,
        seasonPointTotal: 100,
        memberPointTotal: 0,
      });

      // 一开始就尝试添加超过 totalLevel 的属性，应该返回 400 错误
      const result = await put(app, addPlayerPropertyUrl, {
        steamId,
        name: 'property_cooldown_percentage',
        level: 4, // totalLevel = 3，尝试添加 level 4 应该报错
      });

      expect(result.status).toEqual(400);
    });
  });

  describe('/api/game/end (Post) 响应体验证', () => {
    it('验证响应返回OK字符串', async () => {
      mockDate('2023-12-01T00:00:00.000Z');
      const result = await post(app, gameEndUrl, createGameEndPayload());

      expect(result.status).toEqual(201);
      expect(result.text).toEqual('OK');
    });

    it('断开连接的玩家 正确记录disconnectCount', async () => {
      mockDate('2023-12-01T00:00:00.000Z');
      const steamId = 100001001;

      // 先让玩家正常开始游戏
      await callGameStart(app, [steamId]);

      // 游戏结束，玩家断开连接
      const result = await post(
        app,
        gameEndUrl,
        createGameEndPayload({
          players: [{ steamId, battlePoints: 50, isDisconnected: true }],
        }),
      );

      expect(result.status).toEqual(201);

      // 验证玩家的 disconnectCount 增加
      const player = await getPlayer(app, steamId);
      expect(player.disconnectCount).toEqual(1);
    });

    it('胜利的玩家 正确记录winCount', async () => {
      mockDate('2023-12-01T00:00:00.000Z');
      const steamId = 100001002;

      // 先让玩家正常开始游戏
      await callGameStart(app, [steamId]);

      // 游戏结束，玩家胜利 (teamId === winnerTeamId)
      const result = await post(
        app,
        gameEndUrl,
        createGameEndPayload({
          players: [{ steamId, teamId: 2 }], // teamId === winnerTeamId
        }),
      );

      expect(result.status).toEqual(201);

      const player = await getPlayer(app, steamId);
      expect(player.winCount).toEqual(1);
      expect(player.matchCount).toEqual(1);
    });

    it('失败的玩家 matchCount增加但winCount不增加', async () => {
      mockDate('2023-12-01T00:00:00.000Z');
      const steamId = 100001003;

      await callGameStart(app, [steamId]);

      // 游戏结束，玩家失败 (teamId !== winnerTeamId)
      const result = await post(
        app,
        gameEndUrl,
        createGameEndPayload({
          players: [{ steamId, teamId: 3 }], // teamId !== winnerTeamId
        }),
      );

      expect(result.status).toEqual(201);

      const player = await getPlayer(app, steamId);
      expect(player.winCount).toEqual(0);
      expect(player.matchCount).toEqual(1);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
