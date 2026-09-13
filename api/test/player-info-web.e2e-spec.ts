import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createIdTokenForSteamId } from './util/util-auth';
import { get, initTest } from './util/util-http';
import { createPlayer } from './util/util-player';

const infoUrl = (steamId: number) => `/api/player/${steamId}/info`;
const propertyUrl = (steamId: number) => `/api/player/${steamId}/property`;
const heroAwakeningUrl = (steamId: number) => `/api/player/${steamId}/hero-awakening`;
const heroAwakeningRandomUrl = (steamId: number) => `/api/player/${steamId}/hero-awakening/random`;

function getWithBearer(app: INestApplication, url: string, idToken: string): request.Test {
  return request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${idToken}`);
}

function putWithBearer(
  app: INestApplication,
  url: string,
  idToken: string,
  body: object = {},
): request.Test {
  return request(app.getHttpServer())
    .put(url)
    .send(body)
    .set('Authorization', `Bearer ${idToken}`);
}

function delWithBearer(
  app: INestApplication,
  url: string,
  idToken: string,
  query: object = {},
): request.Test {
  return request(app.getHttpServer())
    .delete(url)
    .query(query)
    .set('Authorization', `Bearer ${idToken}`);
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

  it('拿 A 的 token 请求 B 的数据，返回 403', async () => {
    const steamIdA = 200000802;
    const steamIdB = 200000803;
    await createPlayer(app, { steamId: steamIdB, seasonPointTotal: 100 });
    const idTokenA = await createIdTokenForSteamId(steamIdA);

    await getWithBearer(app, infoUrl(steamIdB), idTokenA).expect(403);
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

  describe('property (Put/Delete)', () => {
    it('带自己的 ID Token 能给自己加点', async () => {
      const steamId = 200000806;
      await createPlayer(app, { steamId, seasonPointTotal: 100000 });
      const idToken = await createIdTokenForSteamId(steamId);

      await putWithBearer(app, propertyUrl(steamId), idToken, {
        name: 'property_cooldown_percentage',
        level: 1,
      }).expect(200);
    });

    it('拿 A 的 token 给 B 加点，返回 403', async () => {
      const steamIdA = 200000807;
      const steamIdB = 200000808;
      await createPlayer(app, { steamId: steamIdB, seasonPointTotal: 100000 });
      const idTokenA = await createIdTokenForSteamId(steamIdA);

      await putWithBearer(app, propertyUrl(steamIdB), idTokenA, {
        name: 'property_cooldown_percentage',
        level: 1,
      }).expect(403);
    });

    it('token 无效，返回 401', async () => {
      await putWithBearer(app, propertyUrl(200000809), 'not-a-real-token', {
        name: 'property_cooldown_percentage',
        level: 1,
      }).expect(401);
    });

    it('带自己的 ID Token 能洗点', async () => {
      const steamId = 200000810;
      await createPlayer(app, { steamId, seasonPointTotal: 100000 });
      const idToken = await createIdTokenForSteamId(steamId);
      await putWithBearer(app, propertyUrl(steamId), idToken, {
        name: 'property_cooldown_percentage',
        level: 1,
      }).expect(200);

      await delWithBearer(app, propertyUrl(steamId), idToken, { useMemberPoint: false }).expect(
        200,
      );
    });

    it('拿 A 的 token 洗 B 的点，返回 403', async () => {
      const steamIdA = 200000811;
      const steamIdB = 200000812;
      await createPlayer(app, { steamId: steamIdB, seasonPointTotal: 100000 });
      const idTokenA = await createIdTokenForSteamId(steamIdA);

      await delWithBearer(app, propertyUrl(steamIdB), idTokenA, { useMemberPoint: false }).expect(
        403,
      );
    });

    it('不带 token 洗点，返回 401', async () => {
      await request(app.getHttpServer())
        .delete(propertyUrl(200000813))
        .query({ useMemberPoint: false })
        .expect(401);
    });
  });

  describe('hero-awakening (Put)', () => {
    it('带自己的 ID Token 能认领英雄', async () => {
      const steamId = 200000814;
      await createPlayer(app, { steamId, seasonPointTotal: 100000 });
      const idToken = await createIdTokenForSteamId(steamId);

      await putWithBearer(app, heroAwakeningUrl(steamId), idToken, {
        heroName: 'npc_dota_hero_axe',
        useMemberPoint: false,
      }).expect(200);
    });

    it('拿 A 的 token 给 B 认领英雄，返回 403', async () => {
      const steamIdA = 200000815;
      const steamIdB = 200000816;
      await createPlayer(app, { steamId: steamIdB, seasonPointTotal: 100000 });
      const idTokenA = await createIdTokenForSteamId(steamIdA);

      await putWithBearer(app, heroAwakeningUrl(steamIdB), idTokenA, {
        heroName: 'npc_dota_hero_axe',
        useMemberPoint: false,
      }).expect(403);
    });

    it('token 无效，返回 401', async () => {
      await putWithBearer(app, heroAwakeningUrl(200000817), 'not-a-real-token', {
        heroName: 'npc_dota_hero_axe',
        useMemberPoint: false,
      }).expect(401);
    });
  });

  describe('hero-awakening/random (Put)', () => {
    it('带自己的 ID Token 能生成随机候选集', async () => {
      const steamId = 200000818;
      await createPlayer(app, { steamId, seasonPointTotal: 100000 });
      const idToken = await createIdTokenForSteamId(steamId);
      const candidates = ['npc_dota_hero_axe', 'npc_dota_hero_bane', 'npc_dota_hero_lina'];

      const response = await putWithBearer(app, heroAwakeningRandomUrl(steamId), idToken, {
        candidates,
      }).expect(200);

      expect(response.body).toEqual({ candidates });
    });

    it('拿 A 的 token 给 B 生成候选集，返回 403', async () => {
      const steamIdA = 200000819;
      const steamIdB = 200000820;
      await createPlayer(app, { steamId: steamIdB, seasonPointTotal: 100000 });
      const idTokenA = await createIdTokenForSteamId(steamIdA);

      await putWithBearer(app, heroAwakeningRandomUrl(steamIdB), idTokenA, {
        candidates: ['npc_dota_hero_axe'],
      }).expect(403);
    });

    it('token 无效，返回 401', async () => {
      await putWithBearer(app, heroAwakeningRandomUrl(200000821), 'not-a-real-token', {
        candidates: ['npc_dota_hero_axe'],
      }).expect(401);
    });
  });
});
