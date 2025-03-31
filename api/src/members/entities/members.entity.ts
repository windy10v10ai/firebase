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
  // 会员等级
  level: MemberLevel;
}
