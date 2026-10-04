import { INestApplication } from '@nestjs/common';

import { initTest, post } from './util/util-http';

const peer = {
  upnp: false,
  protocolVersion: 1,
  launcherVersion: '0.3.5',
};

describe('LauncherRoom (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await initTest();
  });

  afterAll(async () => {
    await app.close();
  });

  it('开房、列表看到公开房间、加入、轮询取到加入请求、开局后拒绝加入', async () => {
    const opened = await post(app, '/api/launcher/rooms/host', {
      ...peer,
      steamId: 300000001,
      candidates: ['lan:192.168.0.50:50000'],
      publicIp: false,
      public: true,
      map: 'easy',
    });
    expect(opened.status).toEqual(201);
    const { code, token } = opened.body;

    const listed = await post(app, '/api/launcher/rooms/list', {
      steamId: 300000002,
      protocolVersion: peer.protocolVersion,
    });
    expect(listed.status).toEqual(201);
    expect(listed.body.rooms).toContainEqual(expect.objectContaining({ code, map: 'easy' }));

    const joined = await post(app, `/api/launcher/rooms/${code}/join`, {
      ...peer,
      steamId: 300000002,
      candidates: ['lan:192.168.0.13:50001'],
    });
    expect(joined.status).toEqual(201);
    expect(joined.body.hostCandidates).toEqual(['lan:192.168.0.50:50000']);

    const polled = await post(app, '/api/launcher/rooms/host', {
      ...peer,
      steamId: 300000001,
      candidates: ['lan:192.168.0.50:50000'],
      publicIp: false,
      code,
      token,
      results: [{ joinId: joined.body.joinId, path: 'lan', elapsedMs: 300 }],
      started: true,
    });
    expect(polled.status).toEqual(201);
    expect(polled.body.joins).toEqual([]);

    const late = await post(app, `/api/launcher/rooms/${code}/join`, {
      ...peer,
      steamId: 300000003,
      candidates: ['lan:192.168.0.14:50002'],
    });
    expect(late.status).toEqual(409);
    expect(late.body.code).toEqual('game_started');
  });

  it('候选地址格式不对返回 400', async () => {
    const res = await post(app, '/api/launcher/rooms/host', {
      ...peer,
      steamId: 300000011,
      candidates: ['not-an-address'],
      publicIp: false,
    });
    expect(res.status).toEqual(400);
  });
});
