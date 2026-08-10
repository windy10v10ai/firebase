import { Collection } from 'fireorm';

export enum MemberLevel {
  NORMAL = 1,
  PREMIUM = 2,
}

@Collection()
export class Member {
  id: string;
  steamId!: number;
  expireDate!: Date;
  // 最近一次签到时间
  lastDailyDate?: Date;
  // 当前连续有效会员周期起始日期。
  // 从"非会员/已过期"变为"有效会员"时重置为当天；续费/升级时保持不变。
  periodStartDate?: Date;
  // 会员等级
  level: MemberLevel;
}
