import { Collection } from 'fireorm';

/** 某一天某个提交者（或全站）的反馈次数，文档 ID 是日期加提交者。 */
@Collection('FeedbackQuotas')
export class FeedbackQuota {
  id: string;
  count: number;
  /** 最近一小时内的提交时间（毫秒），按小时限频用；存数字免得数组里的时间戳读回来不是 Date */
  recent: number[];
  /** Firestore TTL 字段，只用于清理 */
  expireAt: Date;
}
