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

import {
  HostRoomDto,
  HostRoomResponse,
  JoinRoomDto,
  JoinRoomResponse,
} from './dto/launcher-room.dto';
import { LauncherRoomJoin } from './entities/launcher-room-join.entity';
import { LauncherRoom } from './entities/launcher-room.entity';

// 去掉 0 O 1 I L，玩家转述房间码时不会看错
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// 房主开局前每 2 秒轮询一次，留足网络抖动的余量才判定房间已关
export const ROOM_ALIVE_MS = 2 * 60 * 1000;
// 加入者的握手窗口比它短，更早的加入请求已经失效
export const PENDING_JOIN_MS = 30 * 1000;
const RECORD_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class LauncherRoomService {
  constructor(
    @InjectRepository(LauncherRoom)
    private readonly roomRepository: BaseFirestoreRepository<LauncherRoom>,
    @InjectRepository(LauncherRoomJoin)
    private readonly joinRepository: BaseFirestoreRepository<LauncherRoomJoin>,
    private readonly bigQueryService: BigQueryService,
  ) {}

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
    if (room.hostToken !== dto.token) {
      throw new ForbiddenException();
    }

    for (const result of dto.results ?? []) {
      const join = await this.joinRepository.findById(result.joinId);
      if (join?.roomId === room.roomId) {
        await this.bigQueryService.recordJoinResult(room, join, result.path, result.elapsedMs);
      }
    }

    room.lastSeenAt = now;
    room.started = room.started || dto.started === true;
    await this.roomRepository.update(room);

    const joins = room.started ? [] : await this.findPendingJoins(room, now);
    return {
      code: room.id,
      token: room.hostToken,
      joins: joins.map((join) => ({
        joinId: join.id,
        joinToken: join.joinToken,
        candidates: join.candidates,
      })),
    };
  }

  /** 加入者凭房间码登记，立刻拿回房主的候选地址，不等房主轮询。 */
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
    if (room.protocolVersion !== dto.protocolVersion) {
      throw new ConflictException({ code: 'version_mismatch' });
    }

    const join = await this.joinRepository.create({
      id: randomUUID(),
      roomCode: room.id,
      roomId: room.roomId,
      joinToken: newToken(),
      steamId: dto.steamId,
      candidates: dto.candidates,
      upnp: dto.upnp,
      launcherVersion: dto.launcherVersion,
      country,
      createdAt: now,
      expireAt: expireAt(now),
    });
    return { joinId: join.id, joinToken: join.joinToken, hostCandidates: room.hostCandidates };
  }

  private async open(dto: HostRoomDto, now: Date, country?: string): Promise<HostRoomResponse> {
    if (dto.candidates.length === 0) {
      throw new BadRequestException('candidates must not be empty');
    }
    const room = await this.roomRepository.create({
      id: await this.newCode(now),
      roomId: randomUUID(),
      hostToken: newToken(),
      hostSteamId: dto.steamId,
      hostCandidates: dto.candidates,
      hostUpnp: dto.upnp,
      hostPublicIp: dto.publicIp,
      protocolVersion: dto.protocolVersion,
      started: false,
      lastSeenAt: now,
      createdAt: now,
      expireAt: expireAt(now),
    });
    await this.bigQueryService.recordRoomCreated(room, dto.launcherVersion, country);
    return { code: room.id, token: room.hostToken, joins: [] };
  }

  // 码已被还在用的房间占着就换一个；先查再写不上事务，同一瞬间撞码的概率可以忽略
  private async newCode(now: Date): Promise<string> {
    for (;;) {
      const code = Array.from(
        { length: 6 },
        () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
      ).join('');
      const existing = await this.roomRepository.findById(code);
      if (!existing || now.getTime() - existing.createdAt.getTime() > RECORD_TTL_MS) {
        return code;
      }
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

function newToken(): string {
  return randomBytes(16).toString('hex');
}

function expireAt(now: Date): Date {
  return new Date(now.getTime() + RECORD_TTL_MS);
}
