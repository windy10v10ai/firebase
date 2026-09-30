export interface StatsBaselineFilter {
  windowDays: number;
  maxMultiplierRadiant: number;
  maxMultiplierDire: number;
  minRespawnTimePct: number;
}

export interface StatsBaselineRow {
  difficulty: number;
  sample_count: number;
  damage: number;
  gold: number;
  participation: number;
  survival: number;
  tank: number;
  push: number;
}

/** 按难度求真人玩家的各项平均，口径与个人六边形逐项对应。 */
export function buildStatsBaselineQuery(table: string): string {
  return `
SELECT
  difficulty,
  COUNT(*) AS sample_count,
  AVG(hero_damage / minutes) AS damage,
  AVG(total_gold_earned / minutes) AS gold,
  AVG((kills + assists) / minutes) AS participation,
  AVG(deaths / minutes) AS survival,
  AVG(damage_taken / minutes) AS tank,
  AVG(tower_kills) AS push
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
