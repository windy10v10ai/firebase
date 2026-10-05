import { randomBytes, randomInt, randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { BigQueryService } from '../bigquery/bigquery.service';
import { SteamProfileService } from '../steam-profile/steam-profile.service';

import {
  HostRoomDto,
  HostRoomResponse,
  JoinRoomDto,
  JoinRoomResponse,
  LauncherProfileDto,
  ListRoomsDto,
  ListRoomsResponse,
} from './dto/launcher-room.dto';
import { LauncherRoomJoin } from './entities/launcher-room-join.entity';
import { LauncherRoom } from './entities/launcher-room.entity';
import { LauncherRelayService } from './launcher-relay.service';

// 去掉 0 O 1 I L，玩家转述房间码时不会看错
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// 房主开局前每 2 秒轮询一次，留足网络抖动的余量才判定房间已关
export const ROOM_ALIVE_MS = 2 * 60 * 1000;
// 列表只容忍一次轮询整次失败，房主崩溃后房间很快从列表消失，凭码加入仍按上面的有效期
export const ROOM_LIST_ALIVE_MS = 30 * 1000;
export const ACTIVE_GAME_ALIVE_MS = 90 * 1000;
// 加入者的握手窗口比它短，更早的加入请求已经失效
export const PENDING_JOIN_MS = 30 * 1000;
// 房间码一天后可以重新分配；记录多留几天，方便排查最近的房间
const CODE_REUSE_MS = 24 * 60 * 60 * 1000;
const RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// 所有请求共用一份查询结果，Firestore 读取量不随看列表的人数增长
export const ROOM_LIST_CACHE_MS = 3 * 1000;

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

  // 放在实例上：函数实例处理完请求不会立刻销毁，实例回收或多开时只是多查一次
  private aliveRoomsCache?: { fetchedAt: number; rooms: LauncherRoom[] };

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
        await this.bigQueryService.recordJoinResult(room, join, result.path, result.elapsedMs);
      }
    }

    room.lastSeenAt = now;
    room.started = room.started || dto.started === true;
    Object.assign(room, roomSettings(dto));
    await this.roomRepository.update(room);

    const joins = room.started ? [] : await this.findPendingJoins(room, now);
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
        relay: join.probe ? undefined : this.relayService.issue(join.id, 'h', now),
      })),
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
    return {
      joinId: join.id,
      joinToken: join.joinToken,
      hostCandidates: room.hostCandidates,
      host: { personaName: room.hostPersonaName, avatarUrl: room.hostAvatarUrl },
      self: profile,
      relay: this.relayService.issue(join.id, 'j', now),
    };
  }

  /** 列出请求者能加入的公开房间，不含候选地址与令牌。 */
  async list(dto: ListRoomsDto): Promise<ListRoomsResponse> {
    const now = Date.now();
    const rooms = await this.findAliveRooms(now);
    const activeRooms = rooms.filter(
      (room) =>
        room.public === true &&
        room.started &&
        now - room.lastSeenAt.getTime() <= ACTIVE_GAME_ALIVE_MS,
    );
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
        })),
      activeGames: activeRooms.length,
      activePlayers: activeRooms.reduce((total, room) => total + (room.playerCount ?? 0), 0),
    };
  }

  // 只按心跳一个条件查，其余条件在内存里筛，不用建组合索引
  private async findAliveRooms(now: number): Promise<LauncherRoom[]> {
    if (this.aliveRoomsCache && now - this.aliveRoomsCache.fetchedAt < ROOM_LIST_CACHE_MS) {
      return this.aliveRoomsCache.rooms;
    }
    const rooms = await this.roomRepository
      .whereGreaterThan('lastSeenAt', new Date(now - ACTIVE_GAME_ALIVE_MS))
      .find();
    this.aliveRoomsCache = { fetchedAt: now, rooms };
    return rooms;
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
    return { code: room.id, token: room.hostToken, ...profile, joins: [] };
  }

  // 码已被还在用的房间占着就换一个；先查再写不上事务，同一瞬间撞码的概率可以忽略
  private async newCode(now: Date): Promise<string> {
    for (;;) {
      const code = Array.from(
        { length: 6 },
        () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
      ).join('');
      const existing = await this.roomRepository.findById(code);
      if (!existing || now.getTime() - existing.createdAt.getTime() > CODE_REUSE_MS) {
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

  // 只按房间码等值查再在内存里筛，免得为这张小表建复合索引
  private async findPendingJoins(room: LauncherRoom, now: Date): Promise<LauncherRoomJoin[]> {
    const joins = await this.joinRepository.whereEqualTo('roomCode', room.id).find();
    return joins.filter(
      (join) =>
        join.roomId === room.roomId && now.getTime() - join.createdAt.getTime() <= PENDING_JOIN_MS,
    );
  }
}

// 只取房主这次带上的字段，没带的保留上次的值
function roomSettings(dto: HostRoomDto): Partial<LauncherRoom> {
  const settings: Partial<LauncherRoom> = {
    public: dto.public,
    maxPlayers: dto.maxPlayers,
    map: dto.map,
    playerCount: dto.playerCount,
    kickedSteamIds: dto.kickedSteamIds,
  };
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => value !== undefined),
  ) as Partial<LauncherRoom>;
}

function newToken(): string {
  return randomBytes(16).toString('hex');
}

function expireAt(now: Date): Date {
  return new Date(now.getTime() + RECORD_TTL_MS);
}
