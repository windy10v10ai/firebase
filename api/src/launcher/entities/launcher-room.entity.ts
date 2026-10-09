import { Collection } from 'fireorm';

export const LAUNCHER_ROOM_MAPS = ['easy', 'hard', 'custom'] as const;
export type LauncherRoomMap = (typeof LAUNCHER_ROOM_MAPS)[number];

export interface LauncherRoomPlayer {
  steamId: number;
  personaName?: string;
  avatarUrl?: string;
}

export interface LauncherRelayProbe {
  address: string;
  rtt?: number;
  loss: number;
}

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
  startedAt?: Date;
  /** 游戏已结束、房主还在等结算或等人退出，列表不再显示 */
  ended?: boolean;
  /** 旧版启动器不报这个字段，缺省按私密处理，不进房间列表 */
  public?: boolean;
  maxPlayers?: number;
  map?: LauncherRoomMap;
  playerCount?: number;
  /** 房主报来的房里玩家，不含房主；旧版启动器不报 */
  players?: LauncherRoomPlayer[];
  relayRtt?: number;
  relayLoss?: number;
  /** 房主到每台中转的测量结果，旧版启动器不报 */
  relays?: LauncherRelayProbe[];
  /** 只对这一个房间生效，房主重开房就清空 */
  kickedSteamIds?: number[];
  lastSeenAt: Date;
  createdAt: Date;
  /** Firestore TTL 字段，只用于清理，判断房间是否过期看 lastSeenAt */
  expireAt: Date;
}
