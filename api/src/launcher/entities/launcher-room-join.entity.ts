import { Collection } from 'fireorm';

/** 一次加入请求，房主轮询时取走。 */
@Collection()
export class LauncherRoomJoin {
  id: string;
  roomCode: string;
  roomId: string;
  joinToken: string;
  steamId: number;
  personaName?: string;
  avatarUrl?: string;
  candidates: string[];
  upnp: boolean;
  launcherVersion: string;
  country?: string;
  createdAt: Date;
  /** Firestore TTL 字段，只用于清理 */
  expireAt: Date;
}
