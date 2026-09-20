import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { initTest } from './util/util-http';

const STEAM_ID_64 = '76561198096673251';
const ACCOUNT_ID = 136407523;

function callbackParams(returnTo = 'http://localhost:3000/login/callback'): string {
  return new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID_64}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID_64}`,
    'openid.return_to': returnTo,
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to',
    'openid.sig': 'aQVvbAUBF0DZ0Ldj4ZbGXnhPHBg=',
  }).toString();
}

function stubSteam(responseText: string) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(responseText, { status: 200 }));
}

function uidOf(customToken: string): string {
  const payload = customToken.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64').toString()).uid;
}

function verify(app: INestApplication, openidParams: string): request.Test {
  return request(app.getHttpServer()).post('/api/auth/steam/verify').send({ openidParams });
}

describe('Auth Steam verify (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Steam 核对通过后签发 Custom Token，uid 是 32 位账号 ID', async () => {
    stubSteam('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');

    const response = await verify(app, callbackParams()).expect(201);

    expect(response.body.steamId).toBe(ACCOUNT_ID);
    expect(uidOf(response.body.customToken)).toBe(`${ACCOUNT_ID}`);
  });

  it('签名被改动，Steam 判定无效，返回 401', async () => {
    stubSteam('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n');

    await verify(app, callbackParams()).expect(401);
  });

  it('回调地址不是自家网站，返回 401 且不向 Steam 发请求', async () => {
    const steam = stubSteam('is_valid:true\n');

    await verify(app, callbackParams('https://evil.net/login/callback')).expect(401);

    expect(steam).not.toHaveBeenCalled();
  });

  afterAll(async () => {
    await app.close();
  });
});
