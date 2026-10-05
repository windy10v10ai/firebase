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
  let bigQuery: { recordRoomCreated: jest.Mock; recordJoinResult: jest.Mock };
  let relay: { issue: jest.Mock };
  let service: LauncherRoomService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-03T12:00:00Z') });
    rooms = memoryRepository<LauncherRoom>();
    joins = memoryRepository<LauncherRoomJoin>();
    bigQuery = { recordRoomCreated: jest.fn(), recordJoinResult: jest.fn() };
    const steamProfile = {
      findBySteamId: jest.fn(async (steamId: number) => ({
        steamId: `${steamId}`,
        personaName: steamId === 2002 ? 'CalmDown!' : null,
        avatarUrl: null,
      })),
    };
    relay = { issue: jest.fn(() => undefined) };
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

  it('配了中转时房主与加入者各拿一张同一次加入的通行证，测试连通不发', async () => {
    relay.issue.mockImplementation((joinId: string, role: string) => ({
      address: '1.2.3.4:3478',
      ticket: `${joinId}:${role}`,
    }));
    const room = await service.host(HOST);

    const joined = await service.join(room.code, JOINER);
    const probed = await service.join(room.code, { ...JOINER, probe: true });
    const polled = await service.host({ ...HOST, code: room.code, token: room.token });

    expect(joined.relay?.ticket).toEqual(`${joined.joinId}:j`);
    expect(probed.relay).toBeUndefined();
    expect(polled.joins.map((join) => join.relay?.ticket)).toEqual([
      `${joined.joinId}:h`,
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
      },
    ]);
    await expect(service.join(stale.code, JOINER)).resolves.toBeDefined();
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

    await expect(service.list({ steamId: 2002, protocolVersion: 1 })).resolves.toEqual({
      rooms: [],
      activeGames: 1,
      activePlayers: 4,
    });
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
