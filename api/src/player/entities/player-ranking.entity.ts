import { Collection } from 'fireorm';

@Collection()
export class PlayerRanking {
  id: string; // YYYYMMDD
  // 排名玩家SteamId
  topSteamIds: string[];
  // 1000名玩家分数
  top1000Score: number;
  // 2000名玩家分数
  top2000Score: number;
  // 3000名玩家分数
  top3000Score: number;
  // 4000名玩家分数
  top4000Score: number;
  // 5000名玩家分数
  top5000Score: number;
}
