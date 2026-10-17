import { randomBytes, randomInt, randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { BigQueryService } from '../bigquery/bigquery.service';
import { SteamProfileService } from '../steam-profile/steam-profile.service';

import {
  HostRoomDto,
  HostRoomResponse,
  JoinPath,
  JoinRoomDto,
  JoinRoomResponse,
  LauncherProfileDto,
  ListRoomsDto,
  ListRoomsResponse,
  RelayProbeDto,
} from './dto/launcher-room.dto';
import { LauncherRoomJoin } from './entities/launcher-room-join.entity';
import {
  LauncherRelayProbe,
  LauncherRoom,
  LauncherRoomPlayer,
} from './entities/launcher-room.entity';
import { LauncherRelayService, ROUTE_CHECK } from './launcher-relay.service';

// 去掉 0 O 1 I L，玩家转述房间码时不会看错
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// 房主开局前每 2 秒轮询一次，留足网络抖动的余量才判定房间已关
export const ROOM_ALIVE_MS = 2 * 60 * 1000;
// 列表只容忍一次轮询整次失败，房主崩溃后房间很快从列表消失，凭码加入仍按上面的有效期
export const ROOM_LIST_ALIVE_MS = 30 * 1000;
// 开局后房主 30 秒或 60 秒轮询一次，窗口要容得下漏掉一次心跳
export const ACTIVE_GAME_ALIVE_MS = 150 * 1000;
// 开局前每次轮询都写心跳会占掉大半写入量，10 秒一次仍短于列表存活窗口
export const LOBBY_HEARTBEAT_MS = 10 * 1000;
// 略小于 60 秒，60 秒一次的轮询受抖动影响也不会漏写
export const GAME_HEARTBEAT_MS = 50 * 1000;
// 加入者的握手窗口比它短，更早的加入请求已经失效
export const PENDING_JOIN_MS = 30 * 1000;
// 房间跨局保留可以开很久，房主停止轮询一天后房间码才重新分配；
// 记录留一个月，候选地址里的公网 IP 用来按地区分析中转服务器选址
const CODE_REUSE_MS = 24 * 60 * 60 * 1000;
const RECORD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ROOM_LIST_CACHE_MS = 10 * 1000;
export const GAME_LIST_CACHE_MS = 60 * 1000;
// 中转延迟丢包每次轮询都在变，只随心跳写入，不算状态变化
const HEARTBEAT_ONLY_FIELDS = ['relays', 'relayRtt', 'relayLoss'];

interface RoomListCache {
  value?: { fetchedAt: number; rooms: LauncherRoom[] };
  pending?: Promise<LauncherRoom[]>;
}

@Injectable()
export class LauncherRoomService {
  constructor(
    @InjectRepository(LauncherRoom)
    private readonly roomRepository: BaseFirestoreRepository<LauncherRoom>,
    @InjectRepository(LauncherRoomJoin)
    private readonly joinRepository: BaseFirestoreRepository<LauncherRoomJoin>,
    private readonly bigQueryService: BigQueryService,
    private readonly steamProfileService: SteamProfileService,
    private readonly relayService: LauncherRelayService,
  ) {}

  private readonly waitingRoomsCache: RoomListCache = {};
  private readonly gamesCache: RoomListCache = {};

  /** 房主开房、轮询新的加入请求或在开局时关房。 */
  async host(dto: HostRoomDto, country?: string): Promise<HostRoomResponse> {
    const now = new Date();
    if (!dto.code) {
      return this.open(dto, now, country);
    }

    const room = await this.roomRepository.findById(dto.code);
    if (!room) {
      throw new NotFoundException({ code: 'room_not_found' });
    }
    // 不检查过期：房主停止轮询后再带对令牌轮询，房间以同一个码恢复
    if (room.hostToken !== dto.token) {
      throw new ForbiddenException();
    }

    for (const result of dto.results ?? []) {
      const join = await this.joinRepository.findById(result.joinId);
      if (join?.roomId === room.roomId && !join.probe) {
        await this.bigQueryService.recordJoinResult(
          room,
          join,
          result.path,
          result.elapsedMs,
          this.relayAddressOf(result.path, result.relayAddress, join),
        );
      }
    }
    const qualities = [];
    for (const quality of dto.quality ?? []) {
      const join = await this.joinRepository.findById(quality.joinId);
      if (join?.roomId === room.roomId && !join.probe) {
        qualities.push({
          join,
          quality,
          relayAddress: this.relayAddressOf(quality.path, quality.relayAddress, join),
        });
      }
    }
    await this.bigQueryService.recordConnectionQuality(room, qualities);
    const routeChecks = [];
    for (const check of dto.routeChecks ?? []) {
      const join = await this.joinRepository.findById(check.joinId);
      if (join?.roomId === room.roomId && !join.probe) {
        routeChecks.push({ join, check });
      }
    }
    await this.bigQueryService.recordRouteChecks(room, routeChecks);

    const previousGame = room.game;
    // 房主启动下一局，开始、结束状态按新的一局重新算；旧版启动器不报局数，房间只有一局
    if (dto.game !== undefined && dto.game > (room.game ?? 1)) {
      room.game = dto.game;
      room.started = false;
      room.startedAt = FieldValue.delete() as unknown as undefined;
      room.ended = false;
      // 两局之间创意工坊可能更新了地图，加入者按新一局的版本比对
      if (dto.mapVersion) {
        room.mapVersion = dto.mapVersion;
      }
    }

    const playersChanged =
      dto.players !== undefined &&
      dto.players.join() !== (room.players ?? []).map((player) => player.steamId).join();
    if (playersChanged) {
      room.players = await Promise.all(
        dto.players!.map(async (steamId): Promise<LauncherRoomPlayer> => {
          const existing = room.players?.find((player) => player.steamId === steamId);
          return existing ?? { steamId, ...(await this.findProfile(steamId)) };
        }),
      );
    }

    const settings = roomSettings(dto);
    const settingsChanged = Object.entries(settings).some(
      ([key, value]) =>
        !HEARTBEAT_ONLY_FIELDS.includes(key) &&
        JSON.stringify(value) !== JSON.stringify(room[key as keyof LauncherRoom]),
    );
    const stateChanged =
      playersChanged ||
      settingsChanged ||
      room.game !== previousGame ||
      (!room.started && dto.started === true) ||
      (!room.ended && dto.ended === true);

    if (!room.started && dto.started === true) {
      room.startedAt = now;
    }
    room.started = room.started || dto.started === true;
    room.ended = room.ended || dto.ended === true;
    Object.assign(room, settings);

    // 无变化时只按心跳间隔写，轮询本身照常读加入请求
    const heartbeatMs = room.started ? GAME_HEARTBEAT_MS : LOBBY_HEARTBEAT_MS;
    if (stateChanged || now.getTime() - room.lastSeenAt.getTime() >= heartbeatMs) {
      room.lastSeenAt = now;
      await this.roomRepository.update(room);
    }

    const joins = room.started ? [] : await this.findRoomJoins(room, now);
    return {
      code: room.id,
      token: room.hostToken,
      personaName: room.hostPersonaName,
      avatarUrl: room.hostAvatarUrl,
      joins: joins.map((join) => ({
        joinId: join.id,
        joinToken: join.joinToken,
        steamId: join.steamId,
        candidates: join.candidates,
        personaName: join.personaName,
        avatarUrl: join.avatarUrl,
        probe: join.probe === true,
        relay: join.probe
          ? undefined
          : this.relayService.issue(join.id, 'h', now, join.relayOrder ?? this.legacyOrder()),
      })),
      relayAddress: this.relayService.address(),
      relayAddresses: this.relayService.addresses(),
    };
  }

  /** 加入者凭房间码登记或测试连通，立刻拿回房主的候选地址，不等房主轮询。 */
  async join(code: string, dto: JoinRoomDto, country?: string): Promise<JoinRoomResponse> {
    const now = new Date();
    const room = await this.roomRepository.findById(code.trim().toUpperCase());
    // 开局后房主不再轮询，已开局要先于过期判断，否则迟到的人看到的是房间不存在
    if (room?.started) {
      throw new ConflictException({ code: 'game_started' });
    }
    if (!room || now.getTime() - room.lastSeenAt.getTime() > ROOM_ALIVE_MS) {
      throw new NotFoundException({ code: 'room_not_found' });
    }
    if (room.kickedSteamIds?.includes(dto.steamId)) {
      throw new ForbiddenException({ code: 'kicked' });
    }
    if (room.protocolVersion !== dto.protocolVersion) {
      throw new ConflictException({ code: 'version_mismatch' });
    }
    // 只在双方都读到版本时比较：读不到的一方照常放行，版本检查失败不该挡住联机
    if (room.mapVersion && dto.mapVersion && room.mapVersion !== dto.mapVersion) {
      throw new ConflictException({ code: 'map_mismatch' });
    }
    // 测试连通不占名额：满员的房间也要量出延迟，有人离开后才能直接加入
    if (!dto.probe && room.maxPlayers && (room.playerCount ?? 0) >= room.maxPlayers) {
      throw new ConflictException({ code: 'room_full' });
    }

    // 测试连通每次打开加入页对每个房间都发一次，省掉 Steam 资料查询
    const profile = dto.probe ? {} : await this.findProfile(dto.steamId);
    const relayOrder = dto.probe ? undefined : this.relayService.order(room.relays, dto.relays);
    const join = await this.joinRepository.create({
      id: randomUUID(),
      roomCode: room.id,
      roomId: room.roomId,
      joinToken: newToken(),
      steamId: dto.steamId,
      personaName: profile.personaName,
      avatarUrl: profile.avatarUrl,
      candidates: dto.candidates,
      upnp: dto.upnp,
      symmetricNat: dto.symmetricNat,
      launcherVersion: dto.launcherVersion,
      country,
      relayRtt: dto.relayRtt,
      relayLoss: dto.relayLoss,
      relays: plainProbes(dto.relays),
      relayOrder,
      probe: dto.probe,
      createdAt: now,
      expireAt: expireAt(now),
    });
    if (dto.probe) {
      return {
        joinId: join.id,
        joinToken: join.joinToken,
        hostCandidates: room.hostCandidates,
        host: {},
        self: {},
      };
    }
    const relay = this.relayService.issue(join.id, 'j', now, relayOrder ?? []);
    return {
      joinId: join.id,
      joinToken: join.joinToken,
      hostCandidates: room.hostCandidates,
      host: { personaName: room.hostPersonaName, avatarUrl: room.hostAvatarUrl },
      self: profile,
      relay,
      routeCheck: relay ? ROUTE_CHECK : undefined,
    };
  }

  // 没存顺序的加入记录按旧版只认第一台处理
  private legacyOrder(): string[] {
    const address = this.relayService.address();
    return address ? [address] : [];
  }

  private relayAddressOf(
    path: JoinPath | undefined,
    reported: string | undefined,
    join: LauncherRoomJoin,
  ): string | undefined {
    if (path !== 'relay') {
      return undefined;
    }
    return reported ?? join.relayOrder?.[0] ?? this.relayService.address();
  }

  /** 列出请求者能加入的公开房间，不含候选地址与令牌。 */
  async list(dto: ListRoomsDto): Promise<ListRoomsResponse> {
    const now = Date.now();
    const [waitingRooms, cachedGames] = await Promise.all([
      this.findAliveRooms(false),
      this.findAliveRooms(true),
    ]);
    const rooms = waitingRooms.filter(
      (room) => now - room.lastSeenAt.getTime() <= ROOM_LIST_ALIVE_MS,
    );
    // 跨局时等待状态更及时，也要从游戏人数统计中移除同一房间。
    const waitingCodes = new Set(rooms.map((room) => room.id));
    const games = cachedGames
      .filter((room) => !waitingCodes.has(room.id))
      .sort(
        (a, b) =>
          (a.startedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (b.startedAt?.getTime() ?? Number.MAX_SAFE_INTEGER),
      );
    const activeRooms = games.filter((room) => room.public === true);
    return {
      rooms: rooms
        .filter(
          (room) =>
            room.public === true &&
            !room.started &&
            now - room.lastSeenAt.getTime() <= ROOM_LIST_ALIVE_MS &&
            room.protocolVersion === dto.protocolVersion &&
            !(room.mapVersion && dto.mapVersion && room.mapVersion !== dto.mapVersion) &&
            !room.kickedSteamIds?.includes(dto.steamId),
        )
        .map((room) => ({
          code: room.id,
          personaName: room.hostPersonaName,
          avatarUrl: room.hostAvatarUrl,
          map: room.map,
          playerCount: room.playerCount,
          maxPlayers: room.maxPlayers,
          hostRelayRtt: room.relayRtt,
          hostRelays: room.relays,
          players: hostAndPlayers(room),
        })),
      games: games.map((room) => {
        const minutes = room.startedAt
          ? Math.floor((now - room.startedAt.getTime()) / 60000)
          : undefined;
        // 好友房的人选了不公开，只给人数与时长
        return room.public === true
          ? {
              public: true,
              map: room.map,
              playerCount: room.playerCount,
              minutes,
              players: hostAndPlayers(room),
            }
          : { public: false, playerCount: room.playerCount, minutes };
      }),
      activeGames: activeRooms.length,
      activePlayers: activeRooms.reduce((total, room) => total + (room.playerCount ?? 0), 0),
      relayAddress: this.relayService.address(),
      relayAddresses: this.relayService.addresses(),
    };
  }

  private async findAliveRooms(started: boolean): Promise<LauncherRoom[]> {
    const cache = started ? this.gamesCache : this.waitingRoomsCache;
    const ttl = started ? GAME_LIST_CACHE_MS : ROOM_LIST_CACHE_MS;
    if (cache.value && Date.now() - cache.value.fetchedAt < ttl) {
      return cache.value.rooms;
    }
    if (cache.pending) {
      return cache.pending;
    }
    const query = this.roomRepository.whereEqualTo('started', started);
    if (started) {
      query.whereEqualTo('ended', false);
    }
    const aliveMs = started ? ACTIVE_GAME_ALIVE_MS : ROOM_LIST_ALIVE_MS;
    cache.pending = query
      .whereGreaterThan('lastSeenAt', new Date(Date.now() - aliveMs))
      .find()
      .then((rooms) => {
        cache.value = { fetchedAt: Date.now(), rooms };
        return rooms;
      })
      .finally(() => {
        cache.pending = undefined;
      });
    return cache.pending;
  }

  private async open(dto: HostRoomDto, now: Date, country?: string): Promise<HostRoomResponse> {
    if (dto.candidates.length === 0) {
      throw new BadRequestException('candidates must not be empty');
    }
    const profile = await this.findProfile(dto.steamId);
    const room = await this.roomRepository.create({
      id: await this.newCode(now),
      roomId: randomUUID(),
      hostToken: newToken(),
      hostSteamId: dto.steamId,
      hostPersonaName: profile.personaName,
      hostAvatarUrl: profile.avatarUrl,
      hostCandidates: dto.candidates,
      hostUpnp: dto.upnp,
      hostPublicIp: dto.publicIp,
      hostSymmetricNat: dto.symmetricNat,
      protocolVersion: dto.protocolVersion,
      mapVersion: dto.mapVersion,
      started: false,
      ...roomSettings(dto),
      lastSeenAt: now,
      createdAt: now,
      expireAt: expireAt(now),
    });
    await this.bigQueryService.recordRoomCreated(room, dto.launcherVersion, country);
    return {
      code: room.id,
      token: room.hostToken,
      ...profile,
      joins: [],
      relayAddress: this.relayService.address(),
      relayAddresses: this.relayService.addresses(),
    };
  }

  // 码已被还在用的房间占着就换一个；先查再写不上事务，同一瞬间撞码的概率可以忽略
  private async newCode(now: Date): Promise<string> {
    for (;;) {
      const code = Array.from(
        { length: 6 },
        () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
      ).join('');
      const existing = await this.roomRepository.findById(code);
      if (!existing || now.getTime() - existing.lastSeenAt.getTime() > CODE_REUSE_MS) {
        return code;
      }
    }
  }

  // 昵称头像只用于启动器里的玩家列表，取不到时照常开房、加入
  private async findProfile(steamId: number): Promise<LauncherProfileDto> {
    if (!steamId) {
      return {};
    }
    try {
      const profile = await this.steamProfileService.findBySteamId(steamId);
      return {
        personaName: profile.personaName ?? undefined,
        avatarUrl: profile.avatarUrl ?? undefined,
      };
    } catch {
      return {};
    }
  }

  private async findRoomJoins(room: LauncherRoom, now: Date): Promise<LauncherRoomJoin[]> {
    return this.joinRepository
      .whereEqualTo('roomId', room.roomId)
      .whereGreaterOrEqualThan('createdAt', new Date(now.getTime() - PENDING_JOIN_MS))
      .find();
  }
}

function hostAndPlayers(room: LauncherRoom): LauncherProfileDto[] {
  return [
    { personaName: room.hostPersonaName, avatarUrl: room.hostAvatarUrl },
    ...(room.players ?? []).map((player) => ({
      personaName: player.personaName,
      avatarUrl: player.avatarUrl,
    })),
  ];
}

// 只取房主这次带上的字段，没带的保留上次的值
function roomSettings(dto: HostRoomDto): Partial<LauncherRoom> {
  const settings: Partial<LauncherRoom> = {
    public: dto.public,
    maxPlayers: dto.maxPlayers,
    map: dto.map,
    playerCount: dto.playerCount,
    relayRtt: dto.relayRtt,
    relayLoss: dto.relayLoss,
    relays: plainProbes(dto.relays),
    kickedSteamIds: dto.kickedSteamIds,
  };
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => value !== undefined),
  ) as Partial<LauncherRoom>;
}

// 请求体里是校验用的类实例，Firestore 只收普通对象
function plainProbes(probes: RelayProbeDto[] | undefined): LauncherRelayProbe[] | undefined {
  return probes?.map(({ address, rtt, loss }) => ({ address, rtt, loss }));
}

function newToken(): string {
  return randomBytes(16).toString('hex');
}

function expireAt(now: Date): Date {
  return new Date(now.getTime() + RECORD_TTL_MS);
}
