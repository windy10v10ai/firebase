import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { get, getTestApiKey, initTest, mockDate, restoreDate } from './util/util-http';
import { createPlayer, getPlayer } from './util/util-player';

const gameEndLocalUrl = '/api/game/end/local';
const gameStartUrl = '/api/game/start/';
const localApiKey = process.env.LOCAL_APIKEY ?? 'local-apikey';

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

function postAsLocalHost(app: INestApplication, body: object, ip = '127.0.0.1'): request.Test {
  return request(app.getHttpServer())
    .post(gameEndLocalUrl)
    .send(body)
    .set('x-api-key', localApiKey)
    .set('x-forwarded-for', ip);
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

  it('合法本地结算：只加 seasonPointTotal，不改 matchCount/winCount/conductPoint', async () => {
    const steamId = 105620001;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 20, conductPoint: 95 });

    const result = await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000001',
        players: [{ steamId, battlePoints: 200 }],
      }),
      '10.0.0.1',
    );

    expect(result.status).toBe(201);
    const player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(200);
    expect(player.matchCount).toBe(20);
    expect(player.winCount).toBe(0);
    expect(player.conductPoint).toBe(95);
  });

  it('非 LOCAL key（正式测试 key）：拒绝，不写分', async () => {
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
    expect(player.seasonPointTotal).toBe(0);
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
      '10.0.0.2',
    );

    expect(result.status).toBe(201);
    const player = await getPlayer(app, steamId);
    expect(player).toBeFalsy();
  });

  it('matchCount <= 10：拒绝', async () => {
    const steamId = 105620004;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 10 });

    const result = await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000004',
        players: [{ steamId, battlePoints: 200 }],
      }),
      '10.0.0.3',
    );

    expect(result.status).toBe(201);
    const player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(0);
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
      '10.0.0.4',
    );
    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000006',
        players: [{ steamId, battlePoints: 200 }],
      }),
      '10.0.0.5',
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
      '10.0.0.6',
    );
    player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(400);
  });

  it('同一 matchId 重试：幂等，不重复加分', async () => {
    const steamId = 105620006;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 20 });
    const payload = createGameEndLocalPayload({
      matchId: '9100000008',
      players: [{ steamId, battlePoints: 200 }],
    });

    await postAsLocalHost(app, payload, '10.0.0.7');
    await postAsLocalHost(app, payload, '10.0.0.7');

    const player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(200);
  });

  it('当日累计超过 1000：整条拒绝，不部分发放', async () => {
    // 单局 battlePoints 会被 clamp 到 500，所以要连续 3 局（每局都满足 20
    // 分钟冷却）才能让第 3 局撞上当日 1000 上限：500 + 500 = 1000（不拒绝），
    // 再 + 500 = 1500 > 1000（拒绝）。
    const steamId = 105620007;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 20 });

    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000009',
        players: [{ steamId, battlePoints: 500 }],
      }),
      '10.0.0.8',
    );
    mockDate('2026-08-16T01:21:00.000Z');
    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000010',
        players: [{ steamId, battlePoints: 500 }],
      }),
      '10.0.0.9',
    );
    let player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(1000);

    mockDate('2026-08-16T01:42:00.000Z');
    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000015',
        players: [{ steamId, battlePoints: 500 }],
      }),
      '10.0.0.10',
    );

    player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(1000);
  });

  it('同一 IP 20 分钟内两个不同 matchId：第二次整体被拒，不处理任何玩家', async () => {
    const steamId1 = 105620008;
    const steamId2 = 105620009;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId: steamId1, matchCount: 20 });
    await createPlayer(app, { steamId: steamId2, matchCount: 20 });
    const sameIp = '10.0.1.1';

    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000011',
        players: [{ steamId: steamId1, battlePoints: 200 }],
      }),
      sameIp,
    );
    await postAsLocalHost(
      app,
      createGameEndLocalPayload({
        matchId: '9100000012',
        players: [{ steamId: steamId2, battlePoints: 200 }],
      }),
      sameIp,
    );

    const player1 = await getPlayer(app, steamId1);
    const player2 = await getPlayer(app, steamId2);
    expect(player1.seasonPointTotal).toBe(200);
    expect(player2.seasonPointTotal).toBe(0);
  });

  it('同一 IP 同一 matchId 重试：不受 IP 限流影响', async () => {
    const steamId = 105620010;
    mockDate('2026-08-16T01:00:00.000Z');
    await createPlayer(app, { steamId, matchCount: 20 });
    const sameIp = '10.0.1.2';
    const payload = createGameEndLocalPayload({
      matchId: '9100000013',
      players: [{ steamId, battlePoints: 200 }],
    });

    const first = await postAsLocalHost(app, payload, sameIp);
    const second = await postAsLocalHost(app, payload, sameIp);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(200);
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
      '10.0.1.3',
    );

    const nextStart = await get(app, gameStartUrl, { steamIds: [steamId], matchId: 9100000015 });
    const nextSnapshot = nextStart.body.dailyTasks.find(
      (s: { steamId: number }) => s.steamId === steamId,
    );
    expect(nextSnapshot.completedTasks).toHaveLength(1);
    expect(nextSnapshot.completedTasks[0].taskId).toBe(candidate.taskId);
  });
});
