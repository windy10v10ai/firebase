export interface StatsBaselineFilter {
  windowDays: number;
  maxMultiplierRadiant: number;
  maxMultiplierDire: number;
  minRespawnTimePct: number;
  minMatchesPerPlayer: number;
  quantileSteps: number;
}

export interface StatsBaselineRow {
  difficulty: number;
  sample_count: number;
  player_count: number;
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

/**
 * 按难度求真人玩家各项的分位点，口径与个人六边形逐项对应。
 * 每局按「1 ÷ 该玩家在该难度的局数」加权，每个玩家合计一票，常玩的玩家不会抬高基准。
 */
export function buildStatsBaselineQuery(table: string): string {
  return `
WITH matches AS (
  SELECT
    steam_id,
    difficulty,
    COUNT(*) OVER (PARTITION BY steam_id, difficulty) AS player_matches,
    hero_damage / minutes AS damage,
    total_gold_earned / minutes AS gold,
    (kills + assists) / minutes AS participation,
    CAST(tower_kills AS FLOAT64) AS push,
    deaths / minutes AS deaths,
    damage_taken / minutes AS tank,
    healing / minutes AS healing,
    assists / minutes AS assists,
    stuns / minutes AS stuns
  FROM (
    SELECT *, dota_time_msec / 60000 AS minutes
    FROM \`${table}\`
    WHERE ended_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @windowDays DAY)
      AND steam_id > 0
      AND NOT IFNULL(is_disconnected, FALSE)
      AND dota_time_msec > 0
      AND IFNULL(game_options.multiplier_radiant, 0) <= @maxMultiplierRadiant
      AND IFNULL(game_options.multiplier_dire, 0) <= @maxMultiplierDire
      AND IFNULL(game_options.respawn_time_pct, 100) >= @minRespawnTimePct
  )
),
weighted AS (
  SELECT difficulty, axis, value, 1 / player_matches AS weight
  FROM (SELECT * FROM matches WHERE player_matches >= @minMatchesPerPlayer)
  UNPIVOT (value FOR axis IN (damage, gold, participation, push, deaths, tank, healing, assists, stuns))
),
cumulative AS (
  SELECT difficulty, axis, value,
    SUM(weight) OVER (PARTITION BY difficulty, axis ORDER BY value ROWS UNBOUNDED PRECEDING)
      / SUM(weight) OVER (PARTITION BY difficulty, axis) AS share
  FROM weighted
),
quantiles AS (
  SELECT difficulty, axis, ARRAY_AGG(value ORDER BY step) AS points
  FROM (
    SELECT difficulty, axis, step, MIN(value) AS value
    FROM cumulative CROSS JOIN UNNEST(GENERATE_ARRAY(0, @quantileSteps)) AS step
    -- 累加 1/n 有浮点误差，末位的累计占比可能略小于 1
    WHERE share >= step / @quantileSteps - 1e-9
    GROUP BY difficulty, axis, step
  )
  GROUP BY difficulty, axis
),
counts AS (
  SELECT difficulty, COUNT(*) AS sample_count, COUNT(DISTINCT steam_id) AS player_count
  FROM matches
  WHERE player_matches >= @minMatchesPerPlayer
  GROUP BY difficulty
)
SELECT
  difficulty,
  ANY_VALUE(sample_count) AS sample_count,
  ANY_VALUE(player_count) AS player_count,
  ARRAY_CONCAT_AGG(IF(axis = 'damage', points, [])) AS damage,
  ARRAY_CONCAT_AGG(IF(axis = 'gold', points, [])) AS gold,
  ARRAY_CONCAT_AGG(IF(axis = 'participation', points, [])) AS participation,
  ARRAY_CONCAT_AGG(IF(axis = 'push', points, [])) AS push,
  ARRAY_CONCAT_AGG(IF(axis = 'deaths', points, [])) AS deaths,
  ARRAY_CONCAT_AGG(IF(axis = 'tank', points, [])) AS tank,
  ARRAY_CONCAT_AGG(IF(axis = 'healing', points, [])) AS healing,
  ARRAY_CONCAT_AGG(IF(axis = 'assists', points, [])) AS assists,
  ARRAY_CONCAT_AGG(IF(axis = 'stuns', points, [])) AS stuns
FROM quantiles JOIN counts USING (difficulty)
GROUP BY difficulty
`;
}
