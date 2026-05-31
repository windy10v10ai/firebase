import { GameEndGameOptionsDto } from '../analytics/dto/game-end-dto';

export const STATS_LIFETIME_MAX_RADIANT_MULTIPLIER = 2;
export const STATS_LIFETIME_MAX_DIRE_MULTIPLIER = 20;
/** 复活时间百分比低于此值视为刷分配置（与 issue #908 respawn_time < 50 同语义） */
export const STATS_LIFETIME_MIN_RESPAWN_TIME_PCT = 50;

export const PER_MATCH_MAX_KILLS = 1000;
export const PER_MATCH_MAX_DEATHS = 1000;
export const PER_MATCH_MAX_ASSISTS = 1000;
export const PER_MATCH_MAX_LAST_HITS = 10000;
export const PER_MATCH_MAX_HERO_DAMAGE = 100000000;
export const PER_MATCH_MAX_DAMAGE_TAKEN = 100000000;
export const PER_MATCH_MAX_HEALING = 100000000;
export const PER_MATCH_MAX_TOWER_KILLS = 100;
export const PER_MATCH_MAX_TOTAL_GOLD_EARNED = 100000000;

export const STATS_LIFETIME_FIELDS = [
  'kills',
  'deaths',
  'assists',
  'lastHits',
  'heroDamage',
  'damageTaken',
  'healing',
  'towerKills',
  'totalGoldEarned',
] as const;

export type StatsLifetimeField = (typeof STATS_LIFETIME_FIELDS)[number];

const FIELD_MAX_MAP: Record<StatsLifetimeField, number> = {
  kills: PER_MATCH_MAX_KILLS,
  deaths: PER_MATCH_MAX_DEATHS,
  assists: PER_MATCH_MAX_ASSISTS,
  lastHits: PER_MATCH_MAX_LAST_HITS,
  heroDamage: PER_MATCH_MAX_HERO_DAMAGE,
  damageTaken: PER_MATCH_MAX_DAMAGE_TAKEN,
  healing: PER_MATCH_MAX_HEALING,
  towerKills: PER_MATCH_MAX_TOWER_KILLS,
  totalGoldEarned: PER_MATCH_MAX_TOTAL_GOLD_EARNED,
};

export function shouldSkipStatsLifetimeForGameOptions(options?: GameEndGameOptionsDto): boolean {
  if (!options) {
    return false;
  }
  if (
    options.multiplierRadiant != null &&
    options.multiplierRadiant > STATS_LIFETIME_MAX_RADIANT_MULTIPLIER
  ) {
    return true;
  }
  if (
    options.multiplierDire != null &&
    options.multiplierDire > STATS_LIFETIME_MAX_DIRE_MULTIPLIER
  ) {
    return true;
  }
  if (
    options.respawnTimePct != null &&
    options.respawnTimePct < STATS_LIFETIME_MIN_RESPAWN_TIME_PCT
  ) {
    return true;
  }
  return false;
}

export function toFiniteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }
  return numberValue;
}

export function validateStatContribution(field: StatsLifetimeField, value: unknown): number | null {
  const numberValue = toFiniteNumber(value);
  if (numberValue === null || numberValue < 0) {
    return null;
  }
  if (numberValue > FIELD_MAX_MAP[field]) {
    return null;
  }
  return numberValue;
}
