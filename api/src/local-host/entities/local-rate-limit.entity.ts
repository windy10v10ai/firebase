import { Collection } from 'fireorm';

export interface IpActivityEntry {
  ip: string;
  country?: string;
  gameEndCount: number;
  gameEndSeasonPoint: number;
  usedMemberPoint: number;
  createdOrderCount: number;
  // 数组内不用 Date：fireorm 只保证顶层字段还原成 Date
  firstAt: number;
  lastAt: number;
}

// id = steamId
@Collection()
export class LocalRateLimit {
  id: string;
  // 结算之外的限额入口不写这两个字段，所以可选
  lastRequestAt?: Date;
  lastRequestMatchId?: string;
  // 以下三个计数共用 dailyDate，日期对不上时一起归零
  dailyDate?: Date;
  dailyGameEndSeasonPoint?: number;
  dailyUsedMemberPoint?: number;
  dailyCreatedOrderCount?: number;
  // 按来源累计且不归零，用于事后分辨消耗来自玩家本人还是盗用者
  ipActivity?: IpActivityEntry[];
}
