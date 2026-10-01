import { PlayerStatsRecentMatch } from './entities/player-stats-recent.entity';

export const RADAR_AXES = ['damage', 'gold', 'participation', 'survival', 'tank', 'push'] as const;

export type RadarAxis = (typeof RADAR_AXES)[number];

interface RadarAxisDefinition {
  value: (match: PlayerStatsRecentMatch) => number;
  perMinute: boolean;
  // 越少越好的项把百分位反过来，图上仍是越大越好
  inverse: boolean;
}

export const RADAR_AXIS_DEFINITIONS: Record<RadarAxis, RadarAxisDefinition> = {
  damage: { value: (m) => m.heroDamage, perMinute: true, inverse: false },
  gold: { value: (m) => m.totalGoldEarned, perMinute: true, inverse: false },
  participation: { value: (m) => m.kills + m.assists, perMinute: true, inverse: false },
  survival: { value: (m) => m.deaths, perMinute: true, inverse: true },
  tank: { value: (m) => m.damageTaken, perMinute: true, inverse: false },
  // 推塔总数有上限，按分钟算会让速推局翻倍
  push: { value: (m) => m.towerKills, perMinute: false, inverse: false },
};

/** 基准统计的时间窗，版本改动后基准要能跟着变 */
export const STATS_BASELINE_WINDOW_DAYS = 30;
// 样本太少的难度，分位点被个别局左右，算出来的百分位没有意义
export const STATS_BASELINE_MIN_SAMPLES = 100;
// 分位点太疏分不出高低，太密会让基准文档变大
export const STATS_BASELINE_QUANTILE_STEPS = 20;
export const RADAR_MIN_MATCHES = 10;
