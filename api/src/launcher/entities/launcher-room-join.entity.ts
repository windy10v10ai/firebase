import { Collection } from 'fireorm';

import { LauncherRelayProbe } from './launcher-room.entity';

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
  /** 加入者到每台中转的测量结果，旧版启动器不报 */
  relays?: LauncherRelayProbe[];
  /** 加入时排好的中转顺序，房主轮询拿到同一顺序 */
  relayOrder?: string[];
  /** 测试连通：只量延迟不进游戏，不占名额、不计入加入统计 */
  probe?: boolean;
  createdAt: Date;
  /** Firestore TTL 字段，只用于清理 */
  expireAt: Date;
}
