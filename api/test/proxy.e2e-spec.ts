import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { getLocalApiKey, initTest } from './util/util-http';

const NEW_PLAYER_STEAM_ID = 310030001;

function decodeProxyTitle(html: string): { requestId: string; data: string } {
  const match = html.match(/<title>(.*)\|(.*)<\/title>/);
  if (!match) throw new Error(`unexpected proxy html: ${html}`);
  return { requestId: match[1], data: match[2] };
}

describe('ProxyController (e2e)', () => {
  let app: INestApplication;
  const localKey = getLocalApiKey();

  beforeAll(async () => {
    app = await initTest();
  });

  afterAll(async () => {
    await app.close();
  });

  it('player-info 查无此人时按成功处理，不返回 ERR:not_found', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/proxy/player-info')
      .query({ requestId: 'p_1_1', steamId: NEW_PLAYER_STEAM_ID, apiKey: localKey });

    expect(res.status).toBe(200);
    const { data } = decodeProxyTitle(res.text);
    expect(data).not.toContain('ERR:');
    expect(JSON.parse(data)).toEqual({});
  });

  it('requestId 非法字符时返回 ERR:bad_request', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/proxy/player-info')
      .query({ requestId: 'bad|id', steamId: NEW_PLAYER_STEAM_ID, apiKey: localKey });

    expect(res.status).toBe(200);
    expect(res.text).toContain('ERR:bad_request');
  });
});
