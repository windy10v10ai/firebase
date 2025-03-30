import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { MemberLevel } from '../src/members/entities/members.entity';

import { get, initTest, mockDate, post, restoreDate } from './util/util-http';
import { addPlayerProperty, createPlayer, getPlayer, getPlayerProperty } from './util/util-player';

const gameStartUrl = '/api/game/start/';
const gameEndUrl = '/api/game/end';
const memberPostUrl = '/api/members/';
const resetPlayerPropertyUrl = '/api/game/resetPlayerProperty';

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

describe('PlayerController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterEach(() => {
    restoreDate();
  });

  describe(`${gameStartUrl} (Get)`, () => {
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

      it('有效会员 新玩家 当日首次', async () => {
        const steamIds = [100000011];

        mockDate('2023-12-01T00:00:00.000Z');
        await post(app, memberPostUrl, {
          steamId: 100000011,
          month: 1,
          level: MemberLevel.NORMAL,
        });

        const result = await callGameStart(app, steamIds);
        expect(result.status).toEqual(200);
        // assert player
        const player = await getPlayer(app, 100000011);
        expect(player.memberPointTotal).toEqual(100);
        expect(player.seasonPointTotal).toEqual(0);
      });

      it.each([
        [
          '有效会员 二日首次登录 赋予积分',
          '2023-12-01T00:00:00.000Z',
          100000012,
          '2023-12-01T00:00:00.000Z',
          100,
          '2023-12-02T00:00:00.000Z',
          200,
        ],
        [
          '有效会员 当日第二次 不赋予积分',
          '2023-12-01T00:00:00.000Z',
          100000013,
          '2023-12-01T00:00:00.000Z',
          100,
          '2023-12-01T01:00:00.000Z',
          100,
        ],
        [
          '会员过期后 不赋予积分',
          '2023-10-01T00:00:00.000Z',
          100000014,
          '2023-11-01T00:00:00.000Z',
          100,
          '2023-11-02T01:00:00.000Z',
          100,
        ],
      ])('%s', async (title, dateMember, steamId, date1, point1, date2, point2) => {
        mockDate(dateMember);
        await post(app, memberPostUrl, {
          steamId: steamId,
          month: 1,
          level: MemberLevel.NORMAL,
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
      it('普通玩家 会员', async () => {
        await post(app, memberPostUrl, {
          steamId: 100000032,
          month: 1,
          level: MemberLevel.NORMAL,
        });
        const steamIds = [100000030, 100000031, 100000032];

        const result = await callGameStart(app, steamIds);
        expect(result.status).toEqual(200);
      });
    });
  });
  describe('/api/game/end (Post) 游戏结算', () => {
    it.each([
      ['单人结算 0分', 100000101, 0, 0],
      ['单人结算 90分', 100000102, 90, 90],
      ['单人结算 累加之前的积分', 100000102, 120, 210],
      ['单人结算 1000分', 100000103, 1000, 1000],
      ['单人结算 超过1000分不记录', 100000101, 1001, 0],
      ['单人结算 低于分不记录', 100000101, -1, 0],
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
      expect(player.memberPointTotal).toEqual(0);
      expect(player.seasonPointTotal).toEqual(expectedPoints);

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
      try {
        const player2 = await getPlayer(app, steamId2);
        expect(player2).toStrictEqual({});
      } catch (error) {
        expect(error.response.body).toStrictEqual({});
      }

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

  describe('/api/game/resetPlayerProperty (Post) 重置玩家属性', () => {
    describe('可以重置', () => {
      it.each([
        [
          '使用勇士积分重置 level2',
          {
            body: {
              steamId: 100000402,
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
              steamId: 100000403,
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
              steamId: 100000412,
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
              steamId: 100000413,
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

        const playerProperty = await getPlayerProperty(app, body.steamId);
        expect(playerProperty).toHaveLength(expected.propertyLength);
      });
    });

    describe('无法重置', () => {
      // 不存在的玩家
      it.each([
        {
          body: {
            steamId: 100000421,
            useMemberPoint: false,
          },
          status: 400,
        },
        {
          body: {
            steamId: 100000422,
            useMemberPoint: true,
          },
          status: 400,
        },
      ])('%s', async ({ body, status }) => {
        const result = await post(app, resetPlayerPropertyUrl, body);
        expect(result.status).toEqual(status);
      });
      // 积分不足
      it.each([
        [
          '使用勇士积分，积分不足',
          {
            body: {
              steamId: 100000401,
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
              steamId: 100000411,
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

        const player = await getPlayer(app, body.steamId);
        expect(player.seasonPointTotal).toEqual(after.seasonPointTotal);
        expect(player.memberPointTotal).toEqual(after.memberPointTotal);

        const playerProperty = await getPlayerProperty(app, body.steamId);
        expect(playerProperty).toHaveLength(expected.propertyLength);
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
