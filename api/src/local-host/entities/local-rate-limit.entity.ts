import { Collection } from 'fireorm';

// id = steamId
@Collection()
export class LocalRateLimit {
  id: string;
  // 结算之外的限额入口不写这两个字段，所以可选
  lastRequestAt?: Date;
  lastRequestMatchId?: string;
  // 以下三个计数共用 dailyDate，日期对不上时一起归零
  dailyDate?: Date;
  dailyEarnedSeasonPoint?: number;
  dailyUsedMemberPoint?: number;
  dailyCreatedOrderCount?: number;
}
