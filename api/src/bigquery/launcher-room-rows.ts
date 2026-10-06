import { ConnectionQualityDto, JoinPath } from '../launcher/dto/launcher-room.dto';
import { LauncherRoomJoin } from '../launcher/entities/launcher-room-join.entity';
import { LauncherRoom } from '../launcher/entities/launcher-room.entity';

/** 开房生成一行，上报者就是房主。 */
export function buildRoomCreatedRow(
  room: LauncherRoom,
  launcherVersion: string,
  country: string | undefined,
  eventTime: Date,
): Record<string, unknown> {
  return {
    event_time: eventTime.toISOString(),
    event: 'room_created',
    room_id: room.roomId,
    path: null,
    elapsed_ms: null,
    host_upnp: room.hostUpnp,
    host_public_ip: room.hostPublicIp,
    host_symmetric_nat: room.hostSymmetricNat ?? null,
    joiner_upnp: null,
    joiner_symmetric_nat: null,
    launcher_version: launcherVersion,
    country: country ?? null,
    steam_id: room.hostSteamId,
    host_steam_id: room.hostSteamId,
  };
}

/** 一次加入的结果生成一行，加入者的身份与网络情况取自加入时存下的记录。 */
export function buildJoinResultRow(
  room: LauncherRoom,
  join: LauncherRoomJoin,
  path: JoinPath | undefined,
  elapsedMs: number,
  relayAddress: string | undefined,
  eventTime: Date,
): Record<string, unknown> {
  return {
    event_time: eventTime.toISOString(),
    event: path ? 'join_succeeded' : 'join_failed',
    room_id: room.roomId,
    path: path ?? null,
    elapsed_ms: elapsedMs,
    host_upnp: room.hostUpnp,
    host_public_ip: room.hostPublicIp,
    host_symmetric_nat: room.hostSymmetricNat ?? null,
    joiner_upnp: join.upnp,
    joiner_symmetric_nat: join.symmetricNat ?? null,
    host_relay_rtt_ms: room.relayRtt ?? null,
    host_relay_loss_pct: room.relayLoss ?? null,
    joiner_relay_rtt_ms: join.relayRtt ?? null,
    joiner_relay_loss_pct: join.relayLoss ?? null,
    relay_address: relayAddress ?? null,
    launcher_version: join.launcherVersion,
    country: join.country ?? null,
    steam_id: join.steamId,
    host_steam_id: room.hostSteamId,
  };
}

export interface ConnectionQualityRecord {
  join: LauncherRoomJoin;
  quality: ConnectionQualityDto;
  relayAddress: string | undefined;
}

/** 开局后房主测到的一个加入者一段时间内的连接质量生成一行，身份取自加入时存下的记录。 */
export function buildConnectionQualityRow(
  room: LauncherRoom,
  record: ConnectionQualityRecord,
  eventTime: Date,
): Record<string, unknown> {
  const { join, quality } = record;
  return {
    event_time: eventTime.toISOString(),
    event: 'connection_quality',
    room_id: room.roomId,
    path: quality.path,
    elapsed_ms: null,
    host_upnp: room.hostUpnp,
    host_public_ip: room.hostPublicIp,
    host_symmetric_nat: room.hostSymmetricNat ?? null,
    joiner_upnp: join.upnp,
    joiner_symmetric_nat: join.symmetricNat ?? null,
    relay_address: record.relayAddress ?? null,
    ping_sent: quality.sent,
    ping_lost: quality.lost,
    rtt_p50_ms: quality.rttP50 ?? null,
    rtt_p95_ms: quality.rttP95 ?? null,
    launcher_version: join.launcherVersion,
    country: join.country ?? null,
    steam_id: join.steamId,
    host_steam_id: room.hostSteamId,
  };
}
