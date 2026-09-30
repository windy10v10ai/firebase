import { Collection } from 'fireorm';

import { RadarAxis } from '../player-stats-radar.constants';

export type DifficultyBaseline = Record<RadarAxis, number> & { sampleCount: number };

// 只有一份文档，每天整份覆盖
@Collection()
export class StatsBaseline {
  id: string;
  /** key 是难度 */
  difficulties: Record<string, DifficultyBaseline>;
  updatedAt: Date;
}
