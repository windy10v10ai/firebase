import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { DailyTaskSnapshotDto } from '../src/daily-task/dto/daily-task-snapshot.dto';

import { createIdTokenForSteamId } from './util/util-auth';
import { get, initTest, mockDate, restoreDate } from './util/util-http';
import { createPlayer } from './util/util-player';

const GAME_START_URL = '/api/game/start/';
const snapshotUrl = (steamId: number) => `/api/daily-task/${steamId}`;
const refreshUrl = (steamId: number) => `/api/daily-task/${steamId}/refresh`;

function postWithBearer(
  app: INestApplication,
  url: string,
  idToken: string,
  body: object,
): request.Test {
  return request(app.getHttpServer())
    .post(url)
    .set('Authorization', `Bearer ${idToken}`)
    .send(body);
}

function getWithBearer(app: INestApplication, url: string, idToken: string): request.Test {
  return request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${idToken}`);
}

async function startGame(app: INestApplication, steamIds: number[]) {
  return get(app, GAME_START_URL, { steamIds, matchId: 9000000101, version: 'v4.10' });
}

function taskIdsOf(snapshot: DailyTaskSnapshotDto): string[] {
  return snapshot.candidates.map((candidate) => candidate.taskId).sort();
}

describe('网站每日任务 (e2e)', () => {
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

  it('本人刷新：换掉本轮候选并用掉刷新额度', async () => {
    const steamId = 200001101;
    await createPlayer(app, { steamId });
    mockDate('2026-08-16T10:00:00.000Z');
    const idToken = await createIdTokenForSteamId(steamId);

    const before = await getWithBearer(app, snapshotUrl(steamId), idToken).expect(200);
    expect(before.body.refreshRemaining).toBe(1);

    const refreshed = await postWithBearer(app, refreshUrl(steamId), idToken, {
      dayId: before.body.dayId,
    }).expect(201);

    expect(refreshed.body.refreshRemaining).toBe(0);
    expect(taskIdsOf(refreshed.body)).not.toEqual(taskIdsOf(before.body));
  });

  it('刷新的响应不带历史，页面据此保留已拉回的那份', async () => {
    const steamId = 200001102;
    await createPlayer(app, { steamId });
    mockDate('2026-08-16T10:00:00.000Z');
    const idToken = await createIdTokenForSteamId(steamId);

    const snapshot = await getWithBearer(app, snapshotUrl(steamId), idToken).expect(200);
    expect(snapshot.body.history).toEqual([]);

    const refreshed = await postWithBearer(app, refreshUrl(steamId), idToken, {
      dayId: snapshot.body.dayId,
    }).expect(201);

    expect(refreshed.body.history).toBeUndefined();
  });

  it('刷新别人的任务：403', async () => {
    const owner = 200001103;
    const other = 200001104;
    await createPlayer(app, { steamId: owner });
    await createPlayer(app, { steamId: other });
    mockDate('2026-08-16T10:00:00.000Z');
    await startGame(app, [owner]);
    const idToken = await createIdTokenForSteamId(other);

    await postWithBearer(app, refreshUrl(owner), idToken, { dayId: '20260816' }).expect(403);
  });
});
