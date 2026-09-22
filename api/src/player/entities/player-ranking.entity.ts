import { Collection } from 'fireorm';

export interface RankedPlayer {
  steamId: string;
  personaName: string | null;
  avatarUrl: string | null;
}

// id = UTC 天号 YYYYMMDD，一天一份快照
@Collection()
export class PlayerRanking {
  id: string;
  // 线上还留着只有 topSteamIds 的旧快照，读到没有这个字段的当作不存在
  players?: RankedPlayer[];
}
