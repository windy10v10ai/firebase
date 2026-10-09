export interface StatsBaselineFilter {
  windowDays: number;
  maxMultiplierRadiant: number;
  maxMultiplierDire: number;
  minRespawnTimePct: number;
  quantileSteps: number;
}

export interface StatsBaselineRow {
  difficulty: number;
  sample_count: number;
  damage: number[];
  gold: number[];
  participation: number[];
  push: number[];
  deaths: number[];
  tank: number[];
  healing: number[];
  assists: number[];
  stuns: number[];
}

/** 按难度求真人玩家各项的分位点，口径与个人六边形逐项对应。 */
export function buildStatsBaselineQuery(table: string): string {
  return `
SELECT
  difficulty,
  COUNT(*) AS sample_count,
  APPROX_QUANTILES(hero_damage / minutes, @quantileSteps) AS damage,
  APPROX_QUANTILES(total_gold_earned / minutes, @quantileSteps) AS gold,
  APPROX_QUANTILES((kills + assists) / minutes, @quantileSteps) AS participation,
  APPROX_QUANTILES(tower_kills, @quantileSteps) AS push,
  APPROX_QUANTILES(deaths / minutes, @quantileSteps) AS deaths,
  APPROX_QUANTILES(damage_taken / minutes, @quantileSteps) AS tank,
  APPROX_QUANTILES(healing / minutes, @quantileSteps) AS healing,
  APPROX_QUANTILES(assists / minutes, @quantileSteps) AS assists,
  APPROX_QUANTILES(stuns / minutes, @quantileSteps) AS stuns
FROM (
  SELECT *, game_time_msec / 60000 AS minutes
  FROM \`${table}\`
  WHERE ended_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @windowDays DAY)
    AND steam_id > 0
    AND NOT IFNULL(is_disconnected, FALSE)
    AND game_time_msec > 0
    AND IFNULL(game_options.multiplier_radiant, 0) <= @maxMultiplierRadiant
    AND IFNULL(game_options.multiplier_dire, 0) <= @maxMultiplierDire
    AND IFNULL(game_options.respawn_time_pct, 100) >= @minRespawnTimePct
)
GROUP BY difficulty
`;
}
