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
  symmetricNat?: boolean;
  launcherVersion: string;
  country?: string;
  relayRtt?: number;
  relayLoss?: number;
  /** 测试连通：只量延迟不进游戏，不占名额、不计入加入统计 */
  probe?: boolean;
  createdAt: Date;
  /** Firestore TTL 字段，只用于清理 */
  expireAt: Date;
}
