import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { MemberLevel } from '../src/members/entities/members.entity';

import { createIdTokenForSteamId } from './util/util-auth';
import { get, initTest } from './util/util-http';
import { addMember } from './util/util-member';
import { createPlayer } from './util/util-player';

const infoUrl = (steamId: number) => `/api/player/${steamId}/info`;
const visibilityUrl = (steamId: number) => `/api/player/${steamId}/profile-visibility`;

function getWithBearer(app: INestApplication, url: string, idToken: string): request.Test {
  return request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${idToken}`);
}

function putWithBearer(
  app: INestApplication,
  url: string,
  idToken: string,
  body: object,
): request.Test {
  return request(app.getHttpServer()).put(url).set('Authorization', `Bearer ${idToken}`).send(body);
}

describe('PlayerInfoController 网站来源 (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterAll(async () => {
    await app.close();
  });

  it('带自己的 ID Token 能读到自己的数据', async () => {
    const steamId = 200000801;
    await createPlayer(app, { steamId, seasonPointTotal: 100 });
    const idToken = await createIdTokenForSteamId(steamId);

    const response = await getWithBearer(app, infoUrl(steamId), idToken).expect(200);

    expect(response.body.id).toBe(`${steamId}`);
  });

  it('拿 A 的 token 改 B 的设置，返回 403', async () => {
    const steamIdA = 200000802;
    const steamIdB = 200000803;
    await createPlayer(app, { steamId: steamIdB, seasonPointTotal: 100 });
    const idTokenA = await createIdTokenForSteamId(steamIdA);

    await putWithBearer(app, visibilityUrl(steamIdB), idTokenA, { profileHidden: true }).expect(
      403,
    );
  });

  it('访客读到的是去掉私密字段的公开资料', async () => {
    const steamId = 200000806;
    await createPlayer(app, { steamId, seasonPointTotal: 100, conductPoint: 90 });
    await addMember(app, steamId, 1, MemberLevel.PREMIUM);

    const response = await request(app.getHttpServer())
      .get(infoUrl(steamId))
      .query({ include: 'member,setting' })
      .expect(200);

    expect(response.body.seasonPointTotal).toBe(100);
    expect(response.body.member.enable).toBe(true);
    expect(response.body.member.expireDateString).toBeUndefined();
    expect(response.body.useableSeasonPoint).toBeUndefined();
    expect(response.body.conductPoint).toBeUndefined();
    expect(response.body.checkIn).toBeUndefined();
    expect(response.body.playerSetting).toBeUndefined();
  });

  it('关闭公开后访客与别人都是 403，本人照常读到完整资料；再打开恢复', async () => {
    const steamId = 200000807;
    const otherSteamId = 200000808;
    await createPlayer(app, { steamId, seasonPointTotal: 100 });
    const idToken = await createIdTokenForSteamId(steamId);
    const otherIdToken = await createIdTokenForSteamId(otherSteamId);

    await putWithBearer(app, visibilityUrl(steamId), idToken, { profileHidden: true }).expect(200);

    await request(app.getHttpServer()).get(infoUrl(steamId)).expect(403);
    await getWithBearer(app, infoUrl(steamId), otherIdToken).expect(403);
    const own = await getWithBearer(app, infoUrl(steamId), idToken).expect(200);
    expect(own.body.profileHidden).toBe(true);
    expect(own.body.useableSeasonPoint).toBe(100);

    await putWithBearer(app, visibilityUrl(steamId), idToken, { profileHidden: false }).expect(200);
    await request(app.getHttpServer()).get(infoUrl(steamId)).expect(200);
  });

  it('token 无效，返回 401', async () => {
    await getWithBearer(app, infoUrl(200000804), 'not-a-real-token').expect(401);
  });

  it('走 x-api-key 的既有用例不受影响', async () => {
    const steamId = 200000805;
    await createPlayer(app, { steamId, seasonPointTotal: 100 });

    const response = await get(app, infoUrl(steamId)).expect(200);

    expect(response.body.id).toBe(`${steamId}`);
  });
});
