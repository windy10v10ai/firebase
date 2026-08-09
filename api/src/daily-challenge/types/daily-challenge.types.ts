export const DAILY_CHALLENGE_SNAPSHOT_VERSION = 2 as const;
export const DAILY_CHALLENGE_MATCH_DATA_VERSION = 2 as const;

export type DailyChallengePersonalStar = 1 | 2 | 3;

export enum ChallengeScope {
  GLOBAL = 'global',
  PERSONAL_GENERAL = 'personal_general',
  PERSONAL_HERO = 'personal_hero',
}

export enum ChallengeMetric {
  HERO_DAMAGE = 'hero_damage',
  PHYSICAL_DAMAGE = 'physical_damage',
  MAGICAL_DAMAGE = 'magical_damage',
  PURE_DAMAGE = 'pure_damage',
  DAMAGE_TAKEN = 'damage_taken',
  HEALING = 'healing',
  KILLS = 'kills',
  ASSISTS = 'assists',
  LAST_HITS = 'last_hits',
  TOWER_KILLS = 'tower_kills',
  BOT_KILLS = 'bot_kills',
  ROSHAN_KILLS = 'roshan_kills',
  STUN_DURATION_MS = 'stun_duration_ms',
  SLOW_DURATION_MS = 'slow_duration_ms',
  ROOT_DURATION_MS = 'root_duration_ms',
  SILENCE_DURATION_MS = 'silence_duration_ms',
  TAUNT_DURATION_MS = 'taunt_duration_ms',
  BREAK_DURATION_MS = 'break_duration_ms',
  DEBUFF_DURATION_MS = 'debuff_duration_ms',
}

export enum ChallengeUnit {
  COUNT = 'count',
  DAMAGE = 'damage',
  MILLISECOND = 'millisecond',
}

export const DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION: Readonly<Record<ChallengeMetric, number>> = {
  [ChallengeMetric.HERO_DAMAGE]: 1,
  [ChallengeMetric.PHYSICAL_DAMAGE]: 2,
  [ChallengeMetric.MAGICAL_DAMAGE]: 2,
  [ChallengeMetric.PURE_DAMAGE]: 2,
  [ChallengeMetric.DAMAGE_TAKEN]: 1,
  [ChallengeMetric.HEALING]: 1,
  [ChallengeMetric.KILLS]: 1,
  [ChallengeMetric.ASSISTS]: 1,
  [ChallengeMetric.LAST_HITS]: 1,
  [ChallengeMetric.TOWER_KILLS]: 1,
  [ChallengeMetric.BOT_KILLS]: 2,
  [ChallengeMetric.ROSHAN_KILLS]: 2,
  [ChallengeMetric.STUN_DURATION_MS]: 2,
  [ChallengeMetric.SLOW_DURATION_MS]: 2,
  [ChallengeMetric.ROOT_DURATION_MS]: 2,
  [ChallengeMetric.SILENCE_DURATION_MS]: 2,
  [ChallengeMetric.TAUNT_DURATION_MS]: 2,
  [ChallengeMetric.BREAK_DURATION_MS]: 2,
  [ChallengeMetric.DEBUFF_DURATION_MS]: 2,
};

export const DAILY_CHALLENGE_METRIC_UNIT: Readonly<Record<ChallengeMetric, ChallengeUnit>> = {
  [ChallengeMetric.HERO_DAMAGE]: ChallengeUnit.DAMAGE,
  [ChallengeMetric.PHYSICAL_DAMAGE]: ChallengeUnit.DAMAGE,
  [ChallengeMetric.MAGICAL_DAMAGE]: ChallengeUnit.DAMAGE,
  [ChallengeMetric.PURE_DAMAGE]: ChallengeUnit.DAMAGE,
  [ChallengeMetric.DAMAGE_TAKEN]: ChallengeUnit.DAMAGE,
  [ChallengeMetric.HEALING]: ChallengeUnit.DAMAGE,
  [ChallengeMetric.KILLS]: ChallengeUnit.COUNT,
  [ChallengeMetric.ASSISTS]: ChallengeUnit.COUNT,
  [ChallengeMetric.LAST_HITS]: ChallengeUnit.COUNT,
  [ChallengeMetric.TOWER_KILLS]: ChallengeUnit.COUNT,
  [ChallengeMetric.BOT_KILLS]: ChallengeUnit.COUNT,
  [ChallengeMetric.ROSHAN_KILLS]: ChallengeUnit.COUNT,
  [ChallengeMetric.STUN_DURATION_MS]: ChallengeUnit.MILLISECOND,
  [ChallengeMetric.SLOW_DURATION_MS]: ChallengeUnit.MILLISECOND,
  [ChallengeMetric.ROOT_DURATION_MS]: ChallengeUnit.MILLISECOND,
  [ChallengeMetric.SILENCE_DURATION_MS]: ChallengeUnit.MILLISECOND,
  [ChallengeMetric.TAUNT_DURATION_MS]: ChallengeUnit.MILLISECOND,
  [ChallengeMetric.BREAK_DURATION_MS]: ChallengeUnit.MILLISECOND,
  [ChallengeMetric.DEBUFF_DURATION_MS]: ChallengeUnit.MILLISECOND,
};

const MAX_DAMAGE_PER_MATCH = 100_000_000;
const MAX_COMMON_COUNT_PER_MATCH = 1_000;
const MAX_LAST_HITS_PER_MATCH = 10_000;
const MAX_STRUCTURE_OR_BOSS_KILLS_PER_MATCH = 100;
const MAX_CUMULATIVE_DURATION_MS_PER_MATCH = 86_400_000;

/**
 * Conservative anti-inflation limits. Values above a metric limit are rejected as a whole so
 * the match ledger remains deterministic and retry-safe; normal and unusually long 10v10 games
 * remain well below these ceilings.
 */
export const DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION: Readonly<
  Record<ChallengeMetric, number>
> = {
  [ChallengeMetric.HERO_DAMAGE]: MAX_DAMAGE_PER_MATCH,
  [ChallengeMetric.PHYSICAL_DAMAGE]: MAX_DAMAGE_PER_MATCH,
  [ChallengeMetric.MAGICAL_DAMAGE]: MAX_DAMAGE_PER_MATCH,
  [ChallengeMetric.PURE_DAMAGE]: MAX_DAMAGE_PER_MATCH,
  [ChallengeMetric.DAMAGE_TAKEN]: MAX_DAMAGE_PER_MATCH,
  [ChallengeMetric.HEALING]: MAX_DAMAGE_PER_MATCH,
  [ChallengeMetric.KILLS]: MAX_COMMON_COUNT_PER_MATCH,
  [ChallengeMetric.ASSISTS]: MAX_COMMON_COUNT_PER_MATCH,
  [ChallengeMetric.LAST_HITS]: MAX_LAST_HITS_PER_MATCH,
  [ChallengeMetric.TOWER_KILLS]: MAX_STRUCTURE_OR_BOSS_KILLS_PER_MATCH,
  [ChallengeMetric.BOT_KILLS]: MAX_COMMON_COUNT_PER_MATCH,
  [ChallengeMetric.ROSHAN_KILLS]: MAX_STRUCTURE_OR_BOSS_KILLS_PER_MATCH,
  [ChallengeMetric.STUN_DURATION_MS]: MAX_CUMULATIVE_DURATION_MS_PER_MATCH,
  [ChallengeMetric.SLOW_DURATION_MS]: MAX_CUMULATIVE_DURATION_MS_PER_MATCH,
  [ChallengeMetric.ROOT_DURATION_MS]: MAX_CUMULATIVE_DURATION_MS_PER_MATCH,
  [ChallengeMetric.SILENCE_DURATION_MS]: MAX_CUMULATIVE_DURATION_MS_PER_MATCH,
  [ChallengeMetric.TAUNT_DURATION_MS]: MAX_CUMULATIVE_DURATION_MS_PER_MATCH,
  [ChallengeMetric.BREAK_DURATION_MS]: MAX_CUMULATIVE_DURATION_MS_PER_MATCH,
  [ChallengeMetric.DEBUFF_DURATION_MS]: MAX_CUMULATIVE_DURATION_MS_PER_MATCH,
};

export enum ChallengeDayStatus {
  OPEN = 'open',
  CLOSING = 'closing',
  FROZEN = 'frozen',
  REWARDING = 'rewarding',
  SETTLED = 'settled',
}

export enum DailyChallengeRewardSource {
  PERSONAL = 'personal',
  GLOBAL = 'global',
  STREAK = 'streak',
}

export enum DailyChallengeContributionTier {
  TOP = 'top',
  MIDDLE = 'middle',
  BASE = 'base',
}
