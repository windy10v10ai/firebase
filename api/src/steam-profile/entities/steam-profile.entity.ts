import { Collection } from 'fireorm';

// id = 32 位账号 ID
@Collection()
export class SteamProfile {
  id: string;
  // Steam 从没给过结果的玩家这两个字段都不写，靠 fetchedAt 走较短的重试间隔
  personaName?: string;
  avatarUrl?: string;
  fetchedAt: Date;
}
