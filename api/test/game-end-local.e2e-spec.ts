import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  get,
  getLocalApiKey,
  getTestApiKey,
  initTest,
  mockDate,
  restoreDate,
} from './util/util-http';
import { createPlayer, getPlayer, getPlayerStatsLifetime } from './util/util-player';

const gameEndLocalUrl = '/api/game/end/local';
const gameStartUrl = '/api/game/start/';
const localApiKey = getLocalApiKey();

interface GameEndLocalPlayerOptions {
  steamId: number;
  battlePoints?: number;
  dailyTask?: { dayId: string; taskId: string; star: number; seasonPoint: number };
}

function createGameEndLocalPlayer(options: GameEndLocalPlayerOptions) {
  return {
    isDisconnected: false,
    score: 10,
    damageTaken: 1000,
    steamId: options.steamId,
    heroDamage: 5000,
    teamId: 2,
    level: 20,
    kills: 5,
    deaths: 3,
    assists: 2,
    healing: 0,
    lastHits: 50,
    towerKills: 1,
    totalGoldEarned: 10000,
    battlePoints: options.battlePoints ?? 100,
    heroName: 'npc_dota_hero_medusa',
    ...(options.dailyTask ? { dailyTask: options.dailyTask } : {}),
  };
}

const defaultGameOptions = {
  multiplierRadiant: 1,
  multiplierDire: 1,
  playerNumberRadiant: 1,
  playerNumberDire: 1,
  towerPowerPct: 100,
};

interface GameEndLocalPayloadOptions {
  matchId?: string;
  players: GameEndLocalPlayerOptions[];
}

function createGameEndLocalPayload(options: GameEndLocalPayloadOptions) {
  return {
    matchId: options.matchId ?? '9100000001',
    version: 'v4.05',
    winnerTeamId: 2,
    players: options.players.map(createGameEndLocalPlayer),
    gameTimeMsec: 900000,
    gameOptions: defaultGameOptions,
    difficulty: 5,
    steamId: 0,
  };
}

function postAsLocalHost(app: INestApplication, body: object): request.Test {
  return request(app.getHttpServer())
    .post(gameEndLocalUrl)
    .send(body)
    .set('x-api-key', localApiKey);
}

function postAsOfficialHost(app: INestApplication, body: object): request.Test {
  return request(app.getHttpServer())
    .post(gameEndLocalUrl)
    .send(body)
    .set('x-api-key', getTestApiKey());
}

describe('POST /api/game/end/local (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterEach(() => {
    restoreDate();
  });

  afterAll(async () => {
    await app.close();
  });

  it('合法本地结算：累加积分与战绩，不动行为分', async () => {
    const steamId = 105620001;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 20, conductPoint: 95 });

    const result = await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000001',
        players: [{ steamId, battlePoints: 200 }],
      }),
    );

    expect(result.status).toBe(201);
    const player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(200);
    expect(player.matchCount).toBe(21);
    expect(player.winCount).toBe(1);
    expect(player.conductPoint).toBe(95);

    const statsLifetime = await getPlayerStatsLifetime(app, steamId);
    expect(statsLifetime?.kills).toBe(5);
  });

  it('官方 key 也能走本地结算：拿到的是更严格的那套，没有损失', async () => {
    const steamId = 105620002;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 20 });

    const result = await postAsOfficialHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000002',
        players: [{ steamId, battlePoints: 200 }],
      }),
    );

    expect(result.status).toBe(201);
    const player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(200);
  });

  it('玩家不存在：拒绝，不自动建号', async () => {
    const steamId = 105620003;
    mockDate('2026-08-16T01:00:00.000Z');

    const result = await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000003',
        players: [{ steamId, battlePoints: 200 }],
      }),
    );

    expect(result.status).toBe(201);
    const player = await getPlayer(app, steamId);
    expect(player).toBeFalsy();
  });

  it('刚建号的新玩家：第一局就能结算', async () => {
    const steamId = 105620004;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId });

    const result = await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000004',
        players: [{ steamId, battlePoints: 200 }],
      }),
    );

    expect(result.status).toBe(201);
    const player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(200);
    expect(player.matchCount).toBe(1);
  });

  it('20 分钟内重复结算（不同 matchId）拒绝；满 20 分钟后再次结算成功', async () => {
    const steamId = 105620005;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 20 });

    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000005',
        players: [{ steamId, battlePoints: 200 }],
      }),
    );
    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000006',
        players: [{ steamId, battlePoints: 200 }],
      }),
    );
    let player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(200);

    mockDate('2026-08-16T01:20:01.000Z');
    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000007',
        players: [{ steamId, battlePoints: 200 }],
      }),
    );
    player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(400);
  });

  it('同一 matchId 重试：直接判定失败，不重复加分', async () => {
    const steamId = 105620006;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 20 });
    const payload = createGameEndLocalPayload({
      matchId: '9100000008',
      players: [{ steamId, battlePoints: 200 }],
    });

    await postAsLocalHost(app, payload);
    await postAsLocalHost(app, payload);

    const player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(200);
  });

  it('多人比赛中只要有一人未通过检查，整场比赛都不结算、不记录每日任务', async () => {
    const okSteamId = 105620012;
    const badSteamId = 105620013; // 没有建号，会拖累整场比赛
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId: okSteamId, matchCount: 20 });

    const result = await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000016',
        players: [
          { steamId: okSteamId, battlePoints: 200 },
          { steamId: badSteamId, battlePoints: 200 },
        ],
      }),
    );

    expect(result.status).toBe(201);
    // 即使 okSteamId 本身满足所有条件，也因为同一请求里 badSteamId 未通过而不结算。
    const okPlayer = await getPlayer(app, okSteamId);
    expect(okPlayer.seasonPointTotal).toBe(0);
  });

  it('当日累计超过 2000：整条拒绝，不部分发放', async () => {
    // 单局 battlePoints 会被 clamp 到 500，所以要连续 4 局（每局都满足 20
    // 分钟冷却）才能让累计打到当日 2000 上限，第 5 局再 + 500 = 2500 > 2000（拒绝）。
    const steamId = 105620007;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 20 });

    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000009',
        players: [{ steamId, battlePoints: 500 }],
      }),
    );
    mockDate('2026-08-16T01:21:00.000Z');
    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000010',
        players: [{ steamId, battlePoints: 500 }],
      }),
    );
    mockDate('2026-08-16T01:42:00.000Z');
    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000011',
        players: [{ steamId, battlePoints: 500 }],
      }),
    );
    mockDate('2026-08-16T02:03:00.000Z');
    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000012',
        players: [{ steamId, battlePoints: 500 }],
      }),
    );
    let player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(2000);

    mockDate('2026-08-16T02:24:00.000Z');
    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000013',
        players: [{ steamId, battlePoints: 500 }],
      }),
    );

    player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(2000);
  });

  it('本地结算也会记录每日任务完成状态', async () => {
    const steamId = 105620011;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 20 });

    const startResult = await get(app, gameStartUrl, { steamIds: [steamId], matchId: 9100000014 });
    const snapshot = startResult.body.dailyTasks.find(
      (s: { steamId: number }) => s.steamId === steamId,
    );
    const candidate = snapshot.candidates[0];

    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000014',
        players: [
          {
            steamId,
            battlePoints: 100 + candidate.rewardSeasonPoint,
            dailyTask: {
              dayId: snapshot.dayId,
              taskId: candidate.taskId,
              star: candidate.star,
              seasonPoint: candidate.rewardSeasonPoint,
            },
          },
        ],
      }),
    );

    const nextStart = await get(app, gameStartUrl, { steamIds: [steamId], matchId: 9100000015 });
    const nextSnapshot = nextStart.body.dailyTasks.find(
      (s: { steamId: number }) => s.steamId === steamId,
    );
    expect(nextSnapshot.completedTasks).toHaveLength(1);
    expect(nextSnapshot.completedTasks[0].taskId).toBe(candidate.taskId);
  });
});
