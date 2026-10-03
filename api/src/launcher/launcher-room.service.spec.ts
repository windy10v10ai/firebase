import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { BigQueryService } from '../bigquery/bigquery.service';

import { HostRoomDto, JoinRoomDto } from './dto/launcher-room.dto';
import { LauncherRoomJoin } from './entities/launcher-room-join.entity';
import { LauncherRoom } from './entities/launcher-room.entity';
import { LauncherRoomService, PENDING_JOIN_MS, ROOM_ALIVE_MS } from './launcher-room.service';

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
  };
}

const HOST: HostRoomDto = {
  steamId: 1001,
  candidates: ['lan:192.168.0.50:50000', 'stun:1.2.3.4:50000'],
  upnp: true,
  publicIp: false,
  protocolVersion: 1,
  launcherVersion: '0.3.5',
};

const JOINER: JoinRoomDto = {
  steamId: 2002,
  candidates: ['lan:192.168.0.13:50001'],
  upnp: false,
  protocolVersion: 1,
  launcherVersion: '0.3.5',
};

describe('LauncherRoomService', () => {
  let rooms: ReturnType<typeof memoryRepository<LauncherRoom>>;
  let joins: ReturnType<typeof memoryRepository<LauncherRoomJoin>>;
  let bigQuery: { recordRoomCreated: jest.Mock; recordJoinResult: jest.Mock };
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
    service = new LauncherRoomService(
      rooms as never,
      joins as never,
      bigQuery as unknown as BigQueryService,
      steamProfile as never,
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
        candidates: JOINER.candidates,
        personaName: 'CalmDown!',
        avatarUrl: undefined,
      },
    ]);
    expect(joined.self.personaName).toEqual('CalmDown!');
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
      expect.objectContaining({ id: room.code }),
      expect.objectContaining({ id: joined.joinId, steamId: 2002 }),
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

  it('隧道协议版本不同拒绝加入', async () => {
    const room = await service.host(HOST);

    await expect(service.join(room.code, { ...JOINER, protocolVersion: 2 })).rejects.toThrow(
      ConflictException,
    );
  });
});
