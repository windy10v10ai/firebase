import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { MemberLevel } from '../src/members/entities/members.entity';

import { createIdTokenForSteamId } from './util/util-auth';
import { getLocalApiKey, initTest } from './util/util-http';
import { addMember } from './util/util-member';
import { createPlayer } from './util/util-player';

const checkInUrl = (steamId: number) => `/api/player/${steamId}/check-in`;
const infoUrl = (steamId: number) => `/api/player/${steamId}/info?include=member`;

function postWithBearer(app: INestApplication, url: string, idToken: string): request.Test {
  return request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${idToken}`);
}

function getWithBearer(app: INestApplication, url: string, idToken: string): request.Test {
  return request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${idToken}`);
}

describe('网站会员签到 (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterAll(async () => {
    await app.close();
  });

  it('有效会员首次签到：发当日积分并写进玩家余额', async () => {
    const steamId = 200000901;
    await createPlayer(app, { steamId });
    await addMember(app, steamId, 1, MemberLevel.NORMAL);
    const idToken = await createIdTokenForSteamId(steamId);

    const before = await getWithBearer(app, infoUrl(steamId), idToken).expect(200);
    expect(before.body.checkIn.memberPoint.dailyPoint).toBe(100);

    const response = await postWithBearer(app, checkInUrl(steamId), idToken).expect(201);

    expect(response.body.memberPoint).toEqual({
      dailyPoint: 100,
      catchUpDays: 0,
      catchUpPoint: 0,
    });
    expect(response.body.player.memberPointTotal).toBe(before.body.memberPointTotal + 100);
  });

  it('当天重复签到：返回 0，余额不再增加', async () => {
    const steamId = 200000902;
    await createPlayer(app, { steamId });
    await addMember(app, steamId, 1, MemberLevel.NORMAL);
    const idToken = await createIdTokenForSteamId(steamId);

    const first = await postWithBearer(app, checkInUrl(steamId), idToken).expect(201);
    const second = await postWithBearer(app, checkInUrl(steamId), idToken).expect(201);

    expect(second.body.memberPoint).toEqual({
      dailyPoint: 0,
      catchUpDays: 0,
      catchUpPoint: 0,
    });
    expect(second.body.player.memberPointTotal).toBe(first.body.player.memberPointTotal);

    const after = await getWithBearer(app, infoUrl(steamId), idToken).expect(200);
    expect(after.body.checkIn.memberPoint.dailyPoint).toBe(0);
  });

  it('非会员签到：返回 0，不报错，info 里没有 member 也没有签到状态', async () => {
    const steamId = 200000903;
    await createPlayer(app, { steamId });
    const idToken = await createIdTokenForSteamId(steamId);

    const response = await postWithBearer(app, checkInUrl(steamId), idToken).expect(201);

    expect(response.body.memberPoint).toEqual({
      dailyPoint: 0,
      catchUpDays: 0,
      catchUpPoint: 0,
    });

    const info = await getWithBearer(app, infoUrl(steamId), idToken).expect(200);
    expect(info.body.member).toBeUndefined();
    expect(info.body.checkIn).toBeUndefined();
  });

  it('拿 A 的 token 给 B 签到，返回 403', async () => {
    const steamIdA = 200000904;
    const steamIdB = 200000905;
    await createPlayer(app, { steamId: steamIdB });
    const idTokenA = await createIdTokenForSteamId(steamIdA);

    await postWithBearer(app, checkInUrl(steamIdB), idTokenA).expect(403);
  });

  it('没有 token：返回 401', async () => {
    await request(app.getHttpServer()).post(checkInUrl(200000906)).expect(401);
  });

  it('本地 key 不能调签到：返回 401', async () => {
    await request(app.getHttpServer())
      .post(checkInUrl(200000907))
      .set('x-api-key', getLocalApiKey())
      .expect(401);
  });
});
