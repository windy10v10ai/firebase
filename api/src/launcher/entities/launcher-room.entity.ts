import { Collection } from 'fireorm';

/** 启动器联机开房，文档 ID 就是房间码。 */
@Collection()
export class LauncherRoom {
  id: string;
  /** 房间码过期后会被复用，统计与加入请求靠它区分同码的不同房间 */
  roomId: string;
  hostToken: string;
  hostSteamId: number;
  hostCandidates: string[];
  hostUpnp: boolean;
  hostPublicIp: boolean;
  protocolVersion: number;
  /** 进入选英雄后不再接受加入 */
  started: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  /** Firestore TTL 字段，只用于清理，判断房间是否过期看 lastSeenAt */
  expireAt: Date;
}
