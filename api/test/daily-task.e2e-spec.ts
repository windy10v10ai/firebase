import { INestApplication } from '@nestjs/common';
import { getFirestore } from 'firebase-admin/firestore';

import { DailyTaskSnapshotDto } from '../src/daily-task/dto/daily-task-snapshot.dto';
import { PlayerDailyTask } from '../src/daily-task/entities/player-daily-task.entity';

import { get, initTest, mockDate, post, restoreDate } from './util/util-http';
import { getPlayer } from './util/util-player';

const GAME_START_URL = '/api/game/start/';
const GAME_END_URL = '/api/game/end';
const REFRESH_URL = '/api/daily-task/refresh';

function gameEndPlayer(
  steamId: number,
  options: {
    isDisconnected?: boolean;
    battlePoints?: number;
    dailyTask?: { dayId: string; taskId: string; star: number; seasonPoint: number };
  } = {},
) {
  return {
    heroName: 'npc_dota_hero_lina',
    steamId,
    teamId: 2,
    isDisconnected: options.isDisconnected ?? false,
    level: 30,
    totalGoldEarned: 30_000,
    kills: 10,
    deaths: 2,
    assists: 20,
    score: 100,
    battlePoints: options.battlePoints ?? 100,
    lastHits: 100,
    heroDamage: 300_000,
    damageTaken: 100_000,
    healing: 0,
    towerKills: 2,
    ...(options.dailyTask ? { dailyTask: options.dailyTask } : {}),
  };
}

function gameEndPayload(players: ReturnType<typeof gameEndPlayer>[]) {
  return {
    matchId: '9000000001',
    version: 'v4.10',
    difficulty: 5,
    steamId: 0,
    winnerTeamId: 2,
    gameTimeMsec: 1_800_000,
    gameOptions: {
      multiplierRadiant: 1,
      multiplierDire: 1,
      playerNumberRadiant: 1,
      playerNumberDire: 1,
      towerPowerPct: 100,
    },
    players,
  };
}

async function startGame(app: INestApplication, steamIds: number[]) {
  return get(app, GAME_START_URL, { steamIds, matchId: 9000000001, version: 'v4.10' });
}

async function refreshDailyTask(app: INestApplication, steamId: number, dayId: string) {
  return post(app, REFRESH_URL, { steamId, dayId });
}

async function readDailyTask(steamId: number): Promise<PlayerDailyTask | undefined> {
  const snapshot = await getFirestore()
    .collection('PlayerDailyTasks')
    .doc(steamId.toString())
    .get();
  return snapshot.exists ? (snapshot.data() as PlayerDailyTask) : undefined;
}

function findSnapshot(body: { dailyTasks: DailyTaskSnapshotDto[] }, steamId: number) {
  return body.dailyTasks.find((snapshot) => snapshot.steamId === steamId) as DailyTaskSnapshotDto;
}

describe('Daily task Phase1 (e2e)', () => {
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

  it('keeps unfinished candidates stable and completes all three rounds without repeats', async () => {
    const steamId = 105610001;
    mockDate('2026-08-16T10:00:00.000Z');

    const firstStart = await startGame(app, [steamId]);
    const repeatedStart = await startGame(app, [steamId]);
    expect(firstStart.status).toBe(200);
    const firstSnapshot = findSnapshot(firstStart.body, steamId);
    expect(firstSnapshot).not.toHaveProperty('totalRounds');
    expect(firstSnapshot).not.toHaveProperty('currentRound');
    expect(findSnapshot(repeatedStart.body, steamId).candidates).toEqual(firstSnapshot.candidates);

    const completedTaskIds: string[] = [];
    let snapshot = firstSnapshot;
    for (let round = 0; round < 3; round++) {
      const candidate = snapshot.candidates[0];
      completedTaskIds.push(candidate.taskId);
      const end = await post(
        app,
        GAME_END_URL,
        gameEndPayload([
          gameEndPlayer(steamId, {
            battlePoints: 100 + candidate.rewardSeasonPoint,
            dailyTask: {
              dayId: snapshot.dayId,
              taskId: candidate.taskId,
              star: candidate.star,
              seasonPoint: candidate.rewardSeasonPoint,
            },
          }),
        ]),
      );
      expect(end.status).toBe(201);

      const nextStart = await startGame(app, [steamId]);
      snapshot = findSnapshot(nextStart.body, steamId);
      expect(snapshot.completedTasks).toHaveLength(round + 1);
      expect(snapshot.completedTasks[round]).toEqual(candidate);
      expect(snapshot.candidates.every((next) => !completedTaskIds.includes(next.taskId))).toBe(
        true,
      );
    }

    expect(snapshot.candidates).toEqual([]);
    expect(snapshot.completedTasks).toHaveLength(3);
  }, 20_000);

  it('filters removed task ids from the response while preserving rounds and points', async () => {
    const steamId = 105610009;
    const dayId = '20260816';
    mockDate('2026-08-16T10:00:00.000Z');
    await getFirestore()
      .collection('PlayerDailyTasks')
      .doc(steamId.toString())
      .set({
        steamId,
        dayId,
        completedTasks: [
          { taskId: 'general_kills', star: 1 },
          { taskId: 'removed_task_1', star: 2 },
          { taskId: 'removed_task_2', star: 3 },
        ],
        todaySeasonPoint: 240,
        history: [],
        updatedAt: new Date('2026-08-16T09:00:00.000Z'),
      });

    const result = await startGame(app, [steamId]);

    expect(result.status).toBe(200);
    const snapshot = findSnapshot(result.body, steamId);
    expect(snapshot.completedTasks).toEqual([
      {
        taskId: 'general_kills',
        scope: 'personal_general',
        metric: 'kills',
        star: 1,
        target: 60,
        rewardSeasonPoint: 60,
      },
    ]);
    expect(snapshot.candidates).toEqual([]);
    expect(snapshot.todaySeasonPoint).toBe(240);

    const stored = await readDailyTask(steamId);
    expect(stored?.completedTasks).toHaveLength(3);
    expect(stored?.todaySeasonPoint).toBe(240);
  });

  it('does not create a daily task document for an old client game/end', async () => {
    const steamId = 105610002;
    mockDate('2026-08-16T10:00:00.000Z');

    const result = await post(app, GAME_END_URL, gameEndPayload([gameEndPlayer(steamId)]));

    expect(result.status).toBe(201);
    expect(await readDailyTask(steamId)).toBeUndefined();
  });

  it('records a cross-midnight completion before resetting it into history', async () => {
    const steamId = 105610003;
    mockDate('2026-08-16T23:50:00.000Z');
    const firstStart = await startGame(app, [steamId]);
    const firstSnapshot = findSnapshot(firstStart.body, steamId);
    const candidate = firstSnapshot.candidates[0];

    mockDate('2026-08-17T00:30:00.000Z');
    await post(
      app,
      GAME_END_URL,
      gameEndPayload([
        gameEndPlayer(steamId, {
          dailyTask: {
            dayId: firstSnapshot.dayId,
            taskId: candidate.taskId,
            star: candidate.star,
            seasonPoint: candidate.rewardSeasonPoint,
          },
        }),
      ]),
    );

    const beforeReset = await readDailyTask(steamId);
    expect(beforeReset?.dayId).toBe('20260816');
    expect(beforeReset?.completedTasks).toEqual([
      { taskId: candidate.taskId, star: candidate.star },
    ]);

    const secondStart = await startGame(app, [steamId]);
    const secondSnapshot = findSnapshot(secondStart.body, steamId);
    expect(secondSnapshot.dayId).toBe('20260817');
    expect(secondSnapshot.completedTasks).toEqual([]);
    expect(secondSnapshot.history[0]).toEqual({
      dayId: '20260816',
      tasks: [candidate],
      seasonPoint: candidate.rewardSeasonPoint,
    });
    expect(secondSnapshot.candidates).toHaveLength(3);
  });

  it('drops stale-day records without blocking base settlement', async () => {
    const steamId = 105610004;
    mockDate('2026-08-16T10:00:00.000Z');
    const firstStart = await startGame(app, [steamId]);
    const firstSnapshot = findSnapshot(firstStart.body, steamId);
    const candidate = firstSnapshot.candidates[0];

    mockDate('2026-08-17T10:00:00.000Z');
    await startGame(app, [steamId]);
    const result = await post(
      app,
      GAME_END_URL,
      gameEndPayload([
        gameEndPlayer(steamId, {
          battlePoints: 180,
          dailyTask: {
            dayId: firstSnapshot.dayId,
            taskId: candidate.taskId,
            star: candidate.star,
            seasonPoint: candidate.rewardSeasonPoint,
          },
        }),
      ]),
    );

    expect(result.status).toBe(201);
    expect((await readDailyTask(steamId))?.completedTasks).toEqual([]);
    expect((await getPlayer(app, steamId)).seasonPointTotal).toBe(180);
  });

  it('records a task id only once when game/end is retried', async () => {
    const steamId = 105610005;
    mockDate('2026-08-16T10:00:00.000Z');
    const started = await startGame(app, [steamId]);
    const snapshot = findSnapshot(started.body, steamId);
    const candidate = snapshot.candidates[0];
    const payload = gameEndPayload([
      gameEndPlayer(steamId, {
        dailyTask: {
          dayId: snapshot.dayId,
          taskId: candidate.taskId,
          star: candidate.star,
          seasonPoint: candidate.rewardSeasonPoint,
        },
      }),
    ]);

    await post(app, GAME_END_URL, payload);
    await post(app, GAME_END_URL, payload);

    const document = await readDailyTask(steamId);
    expect(document?.completedTasks).toEqual([{ taskId: candidate.taskId, star: candidate.star }]);
    expect(document?.todaySeasonPoint).toBe(candidate.rewardSeasonPoint);
  });

  it('skips disconnected players while recording a connected teammate', async () => {
    const disconnectedId = 105610006;
    const connectedId = 105610007;
    mockDate('2026-08-16T10:00:00.000Z');
    const started = await startGame(app, [disconnectedId, connectedId]);
    const disconnectedSnapshot = findSnapshot(started.body, disconnectedId);
    const connectedSnapshot = findSnapshot(started.body, connectedId);
    const disconnectedCandidate = disconnectedSnapshot.candidates[0];
    const connectedCandidate = connectedSnapshot.candidates[0];

    const result = await post(
      app,
      GAME_END_URL,
      gameEndPayload([
        gameEndPlayer(disconnectedId, {
          isDisconnected: true,
          dailyTask: {
            dayId: disconnectedSnapshot.dayId,
            taskId: disconnectedCandidate.taskId,
            star: disconnectedCandidate.star,
            seasonPoint: disconnectedCandidate.rewardSeasonPoint,
          },
        }),
        gameEndPlayer(connectedId, {
          dailyTask: {
            dayId: connectedSnapshot.dayId,
            taskId: connectedCandidate.taskId,
            star: connectedCandidate.star,
            seasonPoint: connectedCandidate.rewardSeasonPoint,
          },
        }),
      ]),
    );

    expect(result.status).toBe(201);
    expect((await readDailyTask(disconnectedId))?.completedTasks).toEqual([]);
    expect((await readDailyTask(connectedId))?.completedTasks).toEqual([
      { taskId: connectedCandidate.taskId, star: connectedCandidate.star },
    ]);
  });

  it('re-rolls the candidates and recomputes the same set on the next start', async () => {
    const steamId = 105610010;
    mockDate('2026-08-16T10:00:00.000Z');

    const started = await startGame(app, [steamId]);
    const before = findSnapshot(started.body, steamId);
    expect(before.refreshRemaining).toBe(1);

    const refreshed = await refreshDailyTask(app, steamId, before.dayId);
    expect(refreshed.status).toBe(201);
    expect(refreshed.body.candidates).not.toEqual(before.candidates);
    expect(refreshed.body.candidates).toHaveLength(3);
    expect(refreshed.body.refreshRemaining).toBe(0);

    // The whole "candidates are never stored" design rests on this: a later start
    // has to recompute exactly what the refresh returned.
    const restarted = await startGame(app, [steamId]);
    const after = findSnapshot(restarted.body, steamId);
    expect(after.candidates).toEqual(refreshed.body.candidates);
    expect(after.refreshRemaining).toBe(0);
  });

  it('returns the same candidates when a refresh is retried', async () => {
    const steamId = 105610011;
    mockDate('2026-08-16T10:00:00.000Z');
    const started = await startGame(app, [steamId]);
    const dayId = findSnapshot(started.body, steamId).dayId;

    const first = await refreshDailyTask(app, steamId, dayId);
    const second = await refreshDailyTask(app, steamId, dayId);

    expect(second.body.candidates).toEqual(first.body.candidates);
    expect(second.body.refreshRemaining).toBe(0);
    expect((await readDailyTask(steamId))?.refreshCount).toBe(1);
  });

  it('restores the refresh quota after a round is completed', async () => {
    const steamId = 105610012;
    mockDate('2026-08-16T10:00:00.000Z');
    const started = await startGame(app, [steamId]);
    const dayId = findSnapshot(started.body, steamId).dayId;
    const refreshed = await refreshDailyTask(app, steamId, dayId);
    const candidate = refreshed.body.candidates[0];

    await post(
      app,
      GAME_END_URL,
      gameEndPayload([
        gameEndPlayer(steamId, {
          dailyTask: {
            dayId,
            taskId: candidate.taskId,
            star: candidate.star,
            seasonPoint: candidate.rewardSeasonPoint,
          },
        }),
      ]),
    );

    expect((await readDailyTask(steamId))?.refreshCount).toBe(0);
    const nextStart = await startGame(app, [steamId]);
    expect(findSnapshot(nextStart.body, steamId).refreshRemaining).toBe(1);
  });

  it('does not spend a refresh once every round is done', async () => {
    const steamId = 105610013;
    mockDate('2026-08-16T10:00:00.000Z');
    await getFirestore()
      .collection('PlayerDailyTasks')
      .doc(steamId.toString())
      .set({
        steamId,
        dayId: '20260816',
        completedTasks: [
          { taskId: 'general_kills', star: 1 },
          { taskId: 'general_last_hits', star: 2 },
          { taskId: 'general_tower_kills', star: 3 },
        ],
        todaySeasonPoint: 240,
        refreshCount: 0,
        history: [],
        updatedAt: new Date('2026-08-16T09:00:00.000Z'),
      });

    const result = await refreshDailyTask(app, steamId, '20260816');

    expect(result.body.candidates).toEqual([]);
    expect(result.body.refreshRemaining).toBe(0);
    expect((await readDailyTask(steamId))?.refreshCount).toBe(0);
  });

  it('rolls a stale client day over to the new day instead of spending a refresh', async () => {
    const steamId = 105610014;
    mockDate('2026-08-16T10:00:00.000Z');
    const started = await startGame(app, [steamId]);
    const staleDayId = findSnapshot(started.body, steamId).dayId;
    await refreshDailyTask(app, steamId, staleDayId);
    expect((await readDailyTask(steamId))?.refreshCount).toBe(1);

    mockDate('2026-08-17T10:00:00.000Z');
    const result = await refreshDailyTask(app, steamId, staleDayId);

    expect(result.body.dayId).toBe('20260817');
    expect(result.body.refreshRemaining).toBe(1);
    expect((await readDailyTask(steamId))?.refreshCount).toBe(0);
  });

  it('caps battle points at 500 without dropping base settlement', async () => {
    const steamId = 105610008;
    mockDate('2026-08-16T10:00:00.000Z');

    const result = await post(
      app,
      GAME_END_URL,
      gameEndPayload([gameEndPlayer(steamId, { battlePoints: 580 })]),
    );

    expect(result.status).toBe(201);
    const player = await getPlayer(app, steamId);
    expect(player.seasonPointTotal).toBe(500);
    expect(player.matchCount).toBe(1);
  });
});
