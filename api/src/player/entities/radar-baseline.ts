import { RadarAxis } from '../player-stats-radar.constants';

/** 每项从低到高的分位点，相邻两点间隔固定百分比，首尾是最小与最大值。 */
export type DifficultyBaseline = Record<RadarAxis, number[]> & { sampleCount: number };

export interface RadarBaseline {
  /** key 是难度 */
  difficulties: Record<string, DifficultyBaseline>;
}
