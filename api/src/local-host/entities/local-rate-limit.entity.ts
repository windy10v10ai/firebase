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
  // 仅 player 维度文档使用：记录最近一次结算来自哪个 IP，方便日后排查
  ip?: string;
}
