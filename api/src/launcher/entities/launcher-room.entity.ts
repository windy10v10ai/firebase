import { Collection } from 'fireorm';

export const LAUNCHER_ROOM_MAPS = ['easy', 'hard', 'custom'] as const;
export type LauncherRoomMap = (typeof LAUNCHER_ROOM_MAPS)[number];

/** 启动器联机开房，文档 ID 就是房间码。 */
@Collection()
export class LauncherRoom {
  id: string;
  /** 房间码过期后会被复用，统计与加入请求靠它区分同码的不同房间 */
  roomId: string;
  hostToken: string;
  hostSteamId: number;
  hostPersonaName?: string;
  hostAvatarUrl?: string;
  hostCandidates: string[];
  hostUpnp: boolean;
  hostPublicIp: boolean;
  hostSymmetricNat?: boolean;
  protocolVersion: number;
  mapVersion?: string;
  /** 进入选英雄后不再接受加入 */
  started: boolean;
  /** 旧版启动器不报这个字段，缺省按私密处理，不进房间列表 */
  public?: boolean;
  maxPlayers?: number;
  map?: LauncherRoomMap;
  playerCount?: number;
  relayRtt?: number;
  relayLoss?: number;
  /** 只对这一个房间生效，房主重开房就清空 */
  kickedSteamIds?: number[];
  lastSeenAt: Date;
  createdAt: Date;
  /** Firestore TTL 字段，只用于清理，判断房间是否过期看 lastSeenAt */
  expireAt: Date;
}
