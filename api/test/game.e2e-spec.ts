import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { get, initTest, mockDate, post, restoreDate } from './util/util-http';
import { addPlayerProperty, createPlayer, getPlayer, getPlayerProperty } from './util/util-player';

const gameStartUrl = '/api/game/start/';
const playerGetUrl = '/api/player/steamId/';
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
        const playerResult = await get(app, `${playerGetUrl}100000001`);
        expect(playerResult.status).toEqual(200);
        expect(playerResult.body.memberPointTotal).toEqual(0);
        expect(playerResult.body.seasonPointTotal).toEqual(0);
      });

      it('普通玩家 老玩家 当日首次', async () => {
        const steamIds = [100000002];

        mockDate('2023-12-01T00:00:00.000Z');
        const result = await get(app, gameStartUrl, { steamIds, matchId });
        expect(result.status).toEqual(200);
        // assert player
        const playerResult = await get(app, `${playerGetUrl}100000002`);
        expect(playerResult.body.memberPointTotal).toEqual(0);
        expect(playerResult.body.seasonPointTotal).toEqual(0);

        mockDate('2023-12-02T00:00:00.000Z');
        const result2 = await get(app, gameStartUrl, { steamIds, matchId });
        expect(result2.status).toEqual(200);
        // assert player
        const playerResult2 = await get(app, `${playerGetUrl}100000002`);
        expect(playerResult2.body.memberPointTotal).toEqual(0);
        expect(playerResult2.body.seasonPointTotal).toEqual(0);
      });

      it('有效会员 新玩家 当日首次', async () => {
        const steamIds = [100000011];

        mockDate('2023-12-01T00:00:00.000Z');
        await post(app, memberPostUrl, {
          steamId: 100000011,
          month: 1,
        });

        const result = await callGameStart(app, steamIds);
        expect(result.status).toEqual(200);
        // assert player
        const playerResult = await get(app, `${playerGetUrl}100000011`);
        expect(playerResult.body.memberPointTotal).toEqual(100);
        expect(playerResult.body.seasonPointTotal).toEqual(0);
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
        });

        mockDate(date1);
        const result = await get(app, gameStartUrl, {
          steamIds: [steamId],
          matchId,
        });
        expect(result.status).toEqual(200);
        // assert player
        const playerResult = await get(app, `${playerGetUrl}${steamId}`);
        expect(playerResult.body.memberPointTotal).toEqual(point1);
        expect(playerResult.body.seasonPointTotal).toEqual(0);

        mockDate(date2);
        const result2 = await get(app, gameStartUrl, {
          steamIds: [steamId],
          matchId,
        });
        expect(result2.status).toEqual(200);
        // assert player
        const playerResult2 = await get(app, `${playerGetUrl}${steamId}`);
        expect(playerResult2.body.memberPointTotal).toEqual(point2);
        expect(playerResult2.body.seasonPointTotal).toEqual(0);
      });
    });

    describe('多人开始', () => {
      it('普通玩家 会员', async () => {
        await post(app, memberPostUrl, {
          steamId: 100000032,
          month: 1,
        });
        const steamIds = [100000030, 100000031, 100000032];

        const result = await callGameStart(app, steamIds);
        expect(result.status).toEqual(200);
      });
    });
  });

  describe('/api/game/resetPlayerProperty (Post) 重置玩家属性', () => {
    describe('可以重置', () => {
      it.each([
        [
          '使用赛季积分重置 level2',
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
          '使用赛季积分重置 level3',
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
          '使用赛季积分，积分不足',
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
