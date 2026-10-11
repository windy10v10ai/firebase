import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { BigQueryService } from '../bigquery/bigquery.service';

import { HostRoomDto, JoinRoomDto } from './dto/launcher-room.dto';
import { LauncherRoomJoin } from './entities/launcher-room-join.entity';
import { LauncherRoom } from './entities/launcher-room.entity';
import {
  LauncherRoomService,
  PENDING_JOIN_MS,
  ROOM_ALIVE_MS,
  ROOM_LIST_ALIVE_MS,
  ROOM_LIST_CACHE_MS,
} from './launcher-room.service';

function memoryRepository<T extends { id: string }>() {
  const docs = new Map<string, T>();
  return {
    docs,
    findById: jest.fn(async (id: string) => docs.get(id) ?? null),
    create: jest.fn(async (item: T) => {
      docs.set(item.id, { ...item });
      return item;
    }),
    update: jest.fn(async (item: T) => {
      docs.set(item.id, { ...item });
      return item;
    }),
    whereEqualTo: (field: keyof T, value: unknown) => ({
      find: async () => [...docs.values()].filter((doc) => doc[field] === value),
    }),
    whereGreaterThan: jest.fn((field: keyof T, value: Date) => ({
      find: async () => [...docs.values()].filter((doc) => (doc[field] as Date) > value),
    })),
  };
}

const HOST: HostRoomDto = {
  steamId: 1001,
  candidates: ['lan:192.168.0.50:50000', 'stun:1.2.3.4:50000'],
  upnp: true,
  publicIp: false,
  symmetricNat: false,
  protocolVersion: 1,
  launcherVersion: '0.3.5',
};

const JOINER: JoinRoomDto = {
  steamId: 2002,
  candidates: ['lan:192.168.0.13:50001'],
  upnp: false,
  symmetricNat: true,
  protocolVersion: 1,
  launcherVersion: '0.3.5',
};

describe('LauncherRoomService', () => {
  let rooms: ReturnType<typeof memoryRepository<LauncherRoom>>;
  let joins: ReturnType<typeof memoryRepository<LauncherRoomJoin>>;
  let bigQuery: {
    recordRoomCreated: jest.Mock;
    recordJoinResult: jest.Mock;
    recordConnectionQuality: jest.Mock;
    recordRouteChecks: jest.Mock;
  };
  let relay: { issue: jest.Mock; address: jest.Mock; addresses: jest.Mock; order: jest.Mock };
  let service: LauncherRoomService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-03T12:00:00Z') });
    rooms = memoryRepository<LauncherRoom>();
    joins = memoryRepository<LauncherRoomJoin>();
    bigQuery = {
      recordRoomCreated: jest.fn(),
      recordJoinResult: jest.fn(),
      recordConnectionQuality: jest.fn(),
      recordRouteChecks: jest.fn(),
    };
    const steamProfile = {
      findBySteamId: jest.fn(async (steamId: number) => ({
        steamId: `${steamId}`,
        personaName: steamId === 2002 ? 'CalmDown!' : null,
        avatarUrl: null,
      })),
    };
    relay = {
      issue: jest.fn(() => undefined),
      address: jest.fn(() => undefined),
      addresses: jest.fn(() => []),
      order: jest.fn(() => []),
    };
    service = new LauncherRoomService(
      rooms as never,
      joins as never,
      bigQuery as unknown as BigQueryService,
      steamProfile as never,
      relay as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('开房返回 6 位易读房间码与令牌，并记一行开房', async () => {
    const res = await service.host(HOST, 'CN');

    expect(res.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    expect(res.token).toHaveLength(32);
    expect(res.joins).toEqual([]);
    expect(bigQuery.recordRoomCreated).toHaveBeenCalledWith(
      expect.objectContaining({ hostSteamId: 1001 }),
      '0.3.5',
      'CN',
    );
  });

  it('房间码被一天内开的房间占着时换一个码', async () => {
    const first = await service.host(HOST);
    rooms.findById.mockResolvedValueOnce(rooms.docs.get(first.code)!);

    const second = await service.host(HOST);

    expect(rooms.findById).toHaveBeenCalledTimes(3);
    expect(second.code).not.toEqual(first.code);
    expect(rooms.docs.get(first.code)!.hostToken).toEqual(first.token);
  });

  it('加入立刻拿到房主地址，房主下一次轮询取到这个加入请求', async () => {
    const room = await service.host(HOST);

    const joined = await service.join(room.code.toLowerCase(), JOINER, 'JP');
    const polled = await service.host({ ...HOST, code: room.code, token: room.token });

    expect(joined.hostCandidates).toEqual(HOST.candidates);
    expect(polled.joins).toEqual([
      {
        joinId: joined.joinId,
        joinToken: joined.joinToken,
        steamId: 2002,
        candidates: JOINER.candidates,
        personaName: 'CalmDown!',
        avatarUrl: undefined,
        probe: false,
        relay: undefined,
      },
    ]);
    expect(joined.self.personaName).toEqual('CalmDown!');
  });

  it('配了中转时房主与加入者各拿一张同一次加入的通行证、同一个中转顺序，测试连通不发', async () => {
    relay.issue.mockImplementation((joinId: string, role: string, _now: Date, order: string[]) => ({
      address: order[0],
      addresses: order,
      ticket: `${joinId}:${role}`,
    }));
    relay.order.mockReturnValue(['5.6.7.8:27200', '1.2.3.4:27200']);
    const hostRelays = [{ address: '1.2.3.4:27200', rtt: 20, loss: 0 }];
    const joinerRelays = [{ address: '5.6.7.8:27200', rtt: 10, loss: 0 }];
    const room = await service.host({ ...HOST, relays: hostRelays });

    const joined = await service.join(room.code, { ...JOINER, relays: joinerRelays });
    const probed = await service.join(room.code, { ...JOINER, probe: true });
    const polled = await service.host({ ...HOST, code: room.code, token: room.token });

    expect(relay.order).toHaveBeenCalledWith(hostRelays, joinerRelays);
    expect(joined.relay).toEqual({
      address: '5.6.7.8:27200',
      addresses: ['5.6.7.8:27200', '1.2.3.4:27200'],
      ticket: `${joined.joinId}:j`,
    });
    expect(probed.relay).toBeUndefined();
    expect(polled.joins.map((join) => join.relay)).toEqual([
      { ...joined.relay, ticket: `${joined.joinId}:h` },
      undefined,
    ]);
  });

  it('超过 30 秒的加入请求不再返回给房主', async () => {
    const room = await service.host(HOST);
    await service.join(room.code, JOINER);

    jest.advanceTimersByTime(PENDING_JOIN_MS + 1);
    const polled = await service.host({ ...HOST, code: room.code, token: room.token });

    expect(polled.joins).toEqual([]);
  });

  it('令牌不对 403，房间码不存在 404', async () => {
    const room = await service.host(HOST);

    await expect(service.host({ ...HOST, code: room.code, token: 'x' })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.host({ ...HOST, code: 'ZZZZZZ', token: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('房主轮询带上的结果写进统计，别的房间的加入记录不算', async () => {
    const room = await service.host(HOST);
    const joined = await service.join(room.code, JOINER);
    const other = await service.host({ ...HOST, steamId: 3003 });
    const otherJoin = await service.join(other.code, JOINER);

    await service.host({
      ...HOST,
      code: room.code,
      token: room.token,
      results: [
        { joinId: joined.joinId, path: 'punch', elapsedMs: 1200 },
        { joinId: otherJoin.joinId, elapsedMs: 15000 },
      ],
    });

    expect(bigQuery.recordJoinResult).toHaveBeenCalledTimes(1);
    expect(bigQuery.recordJoinResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: room.code, hostSymmetricNat: false }),
      expect.objectContaining({ id: joined.joinId, steamId: 2002, symmetricNat: true }),
      'punch',
      1200,
      undefined,
    );
  });

  it('双方到中转的延迟与丢包随加入结果写进统计', async () => {
    const room = await service.host(HOST);
    const joined = await service.join(room.code, { ...JOINER, relayRtt: 60, relayLoss: 15 });

    await service.host({
      ...HOST,
      code: room.code,
      token: room.token,
      relayRtt: 30,
      relayLoss: 5,
      results: [{ joinId: joined.joinId, path: 'relay', elapsedMs: 2400 }],
    });

    expect(bigQuery.recordJoinResult).toHaveBeenCalledWith(
      expect.objectContaining({ relayRtt: 30, relayLoss: 5 }),
      expect.objectContaining({ relayRtt: 60, relayLoss: 15 }),
      'relay',
      2400,
      undefined,
    );
  });

  it('开局后的连接质量按加入记录写进统计，走中转的带上中转地址，测试连通与别的房间的不写', async () => {
    relay.address.mockReturnValue('1.2.3.4:27200');
    const room = await service.host(HOST);
    const joined = await service.join(room.code, JOINER);
    const probe = await service.join(room.code, { ...JOINER, probe: true });
    const other = await service.host({ ...HOST, steamId: 3003 });
    const otherJoin = await service.join(other.code, JOINER);

    await service.host({
      ...HOST,
      code: room.code,
      token: room.token,
      started: true,
      quality: [
        { joinId: joined.joinId, path: 'relay', sent: 30, lost: 3, rttP50: 45, rttP95: 120 },
        { joinId: joined.joinId, path: 'relay', sent: 30, lost: 0, relayAddress: '5.6.7.8:27200' },
        { joinId: joined.joinId, path: 'punch', sent: 30, lost: 30 },
        { joinId: probe.joinId, path: 'punch', sent: 30, lost: 0, rttP50: 10, rttP95: 12 },
        { joinId: otherJoin.joinId, path: 'lan', sent: 30, lost: 0, rttP50: 1, rttP95: 2 },
      ],
    });

    expect(bigQuery.recordConnectionQuality).toHaveBeenCalledWith(
      expect.objectContaining({ id: room.code }),
      [
        {
          join: expect.objectContaining({ id: joined.joinId }),
          quality: expect.objectContaining({ path: 'relay', lost: 3 }),
          relayAddress: '1.2.3.4:27200',
        },
        {
          join: expect.objectContaining({ id: joined.joinId }),
          quality: expect.objectContaining({ path: 'relay', lost: 0 }),
          relayAddress: '5.6.7.8:27200',
        },
        {
          join: expect.objectContaining({ id: joined.joinId }),
          quality: expect.objectContaining({ path: 'punch', lost: 30 }),
          relayAddress: undefined,
        },
      ],
    );
  });

  it('发了中转通行证才下发选线阈值，加入者的实测结果经房主转报写进统计，别的房间的不写', async () => {
    const room = await service.host(HOST);
    const withoutRelay = await service.join(room.code, JOINER);
    relay.issue.mockReturnValue({ address: 'a', addresses: ['a'], ticket: 't' });
    const joined = await service.join(room.code, { ...JOINER, steamId: 2003 });
    const other = await service.host({ ...HOST, steamId: 3003 });
    const otherJoin = await service.join(other.code, JOINER);
    const check = { path: 'relay', directLossPct: 8, directRttMs: 30, relayLossPct: 0 } as const;

    await service.host({
      ...HOST,
      code: room.code,
      token: room.token,
      routeChecks: [
        { joinId: joined.joinId, ...check },
        { joinId: otherJoin.joinId, ...check },
      ],
    });

    expect(withoutRelay.routeCheck).toBeUndefined();
    expect(joined.routeCheck).toEqual({ directLossPct: 5, relayLossPct: 2 });
    expect(bigQuery.recordRouteChecks).toHaveBeenCalledWith(
      expect.objectContaining({ id: room.code }),
      [
        {
          join: expect.objectContaining({ id: joined.joinId }),
          check: expect.objectContaining(check),
        },
      ],
    );
  });

  it('开局后加入返回 409，房主过期后依旧是 409', async () => {
    const room = await service.host(HOST);
    await service.host({ ...HOST, code: room.code, token: room.token, started: true });

    await expect(service.join(room.code, JOINER)).rejects.toThrow(ConflictException);
    jest.advanceTimersByTime(ROOM_ALIVE_MS + 1);
    await expect(service.join(room.code, JOINER)).rejects.toThrow(ConflictException);
  });

  it('房主 2 分钟没轮询，加入返回 404', async () => {
    const room = await service.host(HOST);

    jest.advanceTimersByTime(ROOM_ALIVE_MS + 1);

    await expect(service.join(room.code, JOINER)).rejects.toThrow(NotFoundException);
  });

  it('隧道协议或地图版本不同拒绝加入，读不到地图版本的一方放行', async () => {
    const room = await service.host({ ...HOST, mapVersion: '111' });

    await expect(service.join(room.code, { ...JOINER, protocolVersion: 2 })).rejects.toThrow(
      ConflictException,
    );
    await expect(service.join(room.code, { ...JOINER, mapVersion: '222' })).rejects.toThrow(
      ConflictException,
    );
    await expect(service.join(room.code, JOINER)).resolves.toBeDefined();
  });

  it('房主停止轮询超过 2 分钟后带对令牌轮询，房间以同一个码恢复', async () => {
    const room = await service.host(HOST);
    jest.advanceTimersByTime(ROOM_ALIVE_MS + 1);

    const resumed = await service.host({ ...HOST, code: room.code, token: room.token });

    expect(resumed.code).toEqual(room.code);
    await expect(service.join(room.code, JOINER)).resolves.toBeDefined();
  });

  it('测试连通不查资料、不受满员限制，房主轮询拿到带标记的记录且不写统计', async () => {
    const room = await service.host({ ...HOST, maxPlayers: 2, playerCount: 2 });

    const probed = await service.join(room.code, { ...JOINER, probe: true });
    const polled = await service.host({
      ...HOST,
      code: room.code,
      token: room.token,
      results: [{ joinId: probed.joinId, path: 'punch', elapsedMs: 800 }],
    });

    expect(probed).toEqual({
      joinId: expect.any(String),
      joinToken: expect.any(String),
      hostCandidates: HOST.candidates,
      host: {},
      self: {},
    });
    expect(polled.joins).toEqual([expect.objectContaining({ joinId: probed.joinId, probe: true })]);
    expect(bigQuery.recordJoinResult).not.toHaveBeenCalled();
  });

  it('被移出的人加入与测试连通都返回 403 kicked，满员时正式加入返回 409 room_full', async () => {
    const room = await service.host({ ...HOST, maxPlayers: 4, playerCount: 3 });
    await service.host({ ...HOST, code: room.code, token: room.token, kickedSteamIds: [2002] });

    for (const dto of [JOINER, { ...JOINER, probe: true }]) {
      await expect(service.join(room.code, dto)).rejects.toMatchObject({
        status: 403,
        response: { code: 'kicked' },
      });
    }
    await expect(service.join(room.code, { ...JOINER, steamId: 3003 })).resolves.toBeDefined();
    await service.host({ ...HOST, code: room.code, token: room.token, playerCount: 4 });
    await expect(service.join(room.code, { ...JOINER, steamId: 3003 })).rejects.toMatchObject({
      status: 409,
      response: { code: 'room_full' },
    });
  });

  it('列表只返回请求者能进的公开房间，不带地址与令牌', async () => {
    const listed = await service.host({
      ...HOST,
      mapVersion: '111',
      public: true,
      map: 'hard',
      playerCount: 3,
      maxPlayers: 10,
    });
    await service.host({ ...HOST, steamId: 3001 });
    await service.host({ ...HOST, steamId: 3002, public: true, protocolVersion: 2 });
    await service.host({ ...HOST, steamId: 3003, public: true, mapVersion: '222' });
    await service.host({ ...HOST, steamId: 3004, public: true, kickedSteamIds: [2002] });
    const started = await service.host({ ...HOST, steamId: 3005, public: true });
    await service.host({ ...HOST, code: started.code, token: started.token, started: true });
    const stale = await service.host({ ...HOST, steamId: 3006, public: true });
    rooms.docs.get(stale.code)!.lastSeenAt = new Date(Date.now() - ROOM_LIST_ALIVE_MS - 1);

    const res = await service.list({ steamId: 2002, protocolVersion: 1, mapVersion: '111' });

    expect(res.rooms).toEqual([
      {
        code: listed.code,
        personaName: undefined,
        avatarUrl: undefined,
        map: 'hard',
        playerCount: 3,
        maxPlayers: 10,
        players: [{ personaName: undefined, avatarUrl: undefined }],
      },
    ]);
    await expect(service.join(stale.code, JOINER)).resolves.toBeDefined();
  });

  it('配了中转时开房、轮询与列表都带中转地址，列表转交房主报的中转延迟', async () => {
    relay.address.mockReturnValue('1.2.3.4:27200');
    relay.addresses.mockReturnValue(['1.2.3.4:27200', '5.6.7.8:27200']);
    const hostRelays = [{ address: '5.6.7.8:27200', rtt: 30, loss: 0 }];
    const opened = await service.host({ ...HOST, public: true });
    const polled = await service.host({
      ...HOST,
      code: opened.code,
      token: opened.token,
      relayRtt: 42,
      relays: hostRelays,
    });

    const res = await service.list({ steamId: 2002, protocolVersion: 1 });

    expect([opened.relayAddress, polled.relayAddress, res.relayAddress]).toEqual([
      '1.2.3.4:27200',
      '1.2.3.4:27200',
      '1.2.3.4:27200',
    ]);
    expect([opened, polled, res].map((r) => r.relayAddresses)).toEqual(
      Array(3).fill(['1.2.3.4:27200', '5.6.7.8:27200']),
    );
    expect(res.rooms.map((room) => [room.hostRelayRtt, room.hostRelays])).toEqual([
      [42, hostRelays],
    ]);
  });

  it('列表汇总仍在进行的公开游戏与玩家数', async () => {
    const current = await service.host({ ...HOST, steamId: 3001, public: true, playerCount: 4 });
    await service.host({
      ...HOST,
      code: current.code,
      token: current.token,
      started: true,
      playerCount: 4,
    });
    const privateRoom = await service.host({ ...HOST, steamId: 3002, playerCount: 5 });
    await service.host({
      ...HOST,
      code: privateRoom.code,
      token: privateRoom.token,
      started: true,
      playerCount: 5,
    });
    const stale = await service.host({ ...HOST, steamId: 3003, public: true, playerCount: 6 });
    await service.host({
      ...HOST,
      code: stale.code,
      token: stale.token,
      started: true,
      playerCount: 6,
    });
    rooms.docs.get(stale.code)!.lastSeenAt = new Date(Date.now() - 90 * 1000 - 1);

    const res = await service.list({ steamId: 2002, protocolVersion: 1 });

    expect(res).toMatchObject({ activeGames: 1, activePlayers: 4 });
    expect(res.games.map((game) => [game.public, game.playerCount])).toEqual([
      [true, 4],
      [false, 5],
    ]);
  });

  it('进行中的游戏按开局先后列出，公开的带玩家资料，好友房只给人数与时长，结束的不列', async () => {
    const room = await service.host({ ...HOST, public: true, map: 'hard' });
    await service.join(room.code, JOINER);
    const poll = { ...HOST, code: room.code, token: room.token };
    await service.host({ ...poll, players: [2002, 4004] });
    await service.host({ ...poll, started: true, playerCount: 3 });
    jest.advanceTimersByTime(5 * 60 * 1000);
    const friends = await service.host({ ...HOST, steamId: 3001 });
    await service.host({
      ...HOST,
      code: friends.code,
      token: friends.token,
      started: true,
      playerCount: 2,
    });
    const ended = await service.host({ ...HOST, steamId: 3002, public: true });
    const endedPoll = { ...HOST, code: ended.code, token: ended.token };
    await service.host({ ...endedPoll, started: true });
    await service.host({ ...endedPoll, ended: true });
    jest.advanceTimersByTime(2 * 60 * 1000);
    // 开局后的心跳不改开局时间
    await service.host(poll);
    await service.host({ ...HOST, code: friends.code, token: friends.token });
    await service.host(endedPoll);

    const res = await service.list({ steamId: 2002, protocolVersion: 1 });

    expect(res.games).toEqual([
      {
        public: true,
        map: 'hard',
        playerCount: 3,
        minutes: 7,
        players: [
          { personaName: undefined, avatarUrl: undefined },
          { personaName: 'CalmDown!', avatarUrl: undefined },
          { personaName: undefined, avatarUrl: undefined },
        ],
      },
      { public: false, playerCount: 2, minutes: 2 },
    ]);
  });

  it('列表结果缓存 3 秒，期间不再查 Firestore', async () => {
    const query = { steamId: 2002, protocolVersion: 1 };
    await service.list(query);
    await service.host({ ...HOST, public: true });

    expect((await service.list(query)).rooms).toEqual([]);
    expect(rooms.whereGreaterThan).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(ROOM_LIST_CACHE_MS);
    expect((await service.list(query)).rooms).toHaveLength(1);
    expect(rooms.whereGreaterThan).toHaveBeenCalledTimes(2);
  });
});
