import { PlayerStatsRecentMatch } from './entities/player-stats-recent.entity';

export const RADAR_AXES = [
  'damage',
  'gold',
  'participation',
  'push',
  'deaths',
  'tank',
  'healing',
  'assists',
  'stuns',
] as const;

export type RadarAxis = (typeof RADAR_AXES)[number];

interface RadarAxisDefinition {
  value: (match: PlayerStatsRecentMatch) => number;
  perMinute: boolean;
  // 越少越好的项把百分位反过来，图上仍是越大越好
  inverse: boolean;
  // 多数局为 0 的项，0 记 0 分，大于 0 的局只在非 0 的那一段里排名
  zeroIsFloor: boolean;
}

export const RADAR_AXIS_DEFINITIONS: Record<RadarAxis, RadarAxisDefinition> = {
  damage: { value: (m) => m.heroDamage, perMinute: true, inverse: false, zeroIsFloor: false },
  gold: { value: (m) => m.totalGoldEarned, perMinute: true, inverse: false, zeroIsFloor: false },
  participation: {
    value: (m) => m.kills + m.assists,
    perMinute: true,
    inverse: false,
    zeroIsFloor: false,
  },
  // 推塔总数有上限，按分钟算会让速推局翻倍
  push: { value: (m) => m.towerKills, perMinute: false, inverse: false, zeroIsFloor: false },
  deaths: { value: (m) => m.deaths, perMinute: true, inverse: true, zeroIsFloor: false },
  tank: { value: (m) => m.damageTaken, perMinute: true, inverse: false, zeroIsFloor: false },
  // 多数局没有给队友治疗，按普通百分位算会让 0 落在中间、有治疗的局挤在最顶上
  healing: { value: (m) => m.healing, perMinute: true, inverse: false, zeroIsFloor: true },
  assists: { value: (m) => m.assists, perMinute: true, inverse: false, zeroIsFloor: false },
  stuns: { value: (m) => m.stuns, perMinute: true, inverse: false, zeroIsFloor: false },
};

// 只有少数局有治疗，各局平均后治疗型玩家也拉不开，放大后与其他项的刻度相当
export const RADAR_HEALING_AVERAGE_MULTIPLIER = 5;

/** 基准统计的时间窗，版本改动后基准要能跟着变 */
export const STATS_BASELINE_WINDOW_DAYS = 30;
// 样本太少的难度，分位点被个别局左右，算出来的百分位没有意义
export const STATS_BASELINE_MIN_SAMPLES = 100;
// 分位点太疏分不出高低，太密会让基准文档变大
export const STATS_BASELINE_QUANTILE_STEPS = 20;
export const RADAR_MIN_MATCHES = 10;
