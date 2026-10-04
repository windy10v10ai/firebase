import { Collection } from 'fireorm';

// id = steam-<steamId>、ip-<ip>，全站共用一条 all
@Collection('FeedbackRateLimits')
export class FeedbackRateLimit {
  id: string;
  /** UTC 日期 YYYY-MM-DD，对不上时 dailyCount 归零 */
  dailyDate: string;
  dailyCount: number;
  /** 最近一小时内的提交时间（毫秒）；数组内不用 Date：fireorm 只保证顶层字段还原成 Date */
  recent: number[];
  /** Firestore TTL 字段，只用于清理不再提交的人 */
  expireAt: Date;
}
