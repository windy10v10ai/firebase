import { Collection } from 'fireorm';

import { RadarBaseline } from '../player/entities/radar-baseline';

/** 每种每日统计占一个文档，文档 id 到数据结构的对应在这里登记。 */
export interface DailyStatData {
  radarBaseline: RadarBaseline;
}

export type DailyStatId = keyof DailyStatData;

// 各统计的数据结构不同，集合层面只约定 id 与更新时间，具体结构由 DailyStatData 约束
@Collection()
export class DailyStat {
  id: string;
  data: unknown;
  updatedAt: Date;
}
