import { Collection } from 'fireorm';

// id = `player:<steamId>` | `ip:<ip>`，两种主体共用同一个 collection，各存一行。
@Collection()
export class LocalRateLimit {
  id: string;
  lastRequestAt: Date;
  lastRequestMatchId: string;
  // 仅 player 维度文档使用
  dailyPointsDate?: Date;
  dailyPointsTotal?: number;
}
