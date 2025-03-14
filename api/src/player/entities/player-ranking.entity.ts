import { Collection } from 'fireorm';

@Collection()
export class PlayerRanking {
  id: string; // YYYYMMDD
  // 排名玩家SteamId
  topSteamIds: string[];
  // 各分段分数
  rankScores: {
    top1000: number;
    top2000: number;
    top3000: number;
    top4000: number;
    top5000: number;
  };
}
