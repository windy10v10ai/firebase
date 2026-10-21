-- 替换 PROJECT_ID/DATASET 后手动执行；scan_days 是报告窗口，history_days 用于观察长期规律。
-- 积分流水与审计均为 best-effort，缺行不等于实际未结算，告警只供人工排查。
DECLARE scan_days INT64 DEFAULT 7;
DECLARE history_days INT64 DEFAULT 30;
DECLARE since_at TIMESTAMP DEFAULT TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL scan_days DAY);
DECLARE history_since TIMESTAMP DEFAULT TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL history_days DAY);

WITH history AS (
  SELECT *, TO_JSON_STRING(STRUCT(hero_name, dota_time_msec, kills, deaths, assists,
    last_hits, hero_damage, damage_taken, healing, total_gold_earned)) AS fingerprint
  FROM `${PROJECT_ID}.${DATASET}.game_end_players`
  WHERE ended_at >= history_since AND steam_id > 0
),
ledger AS (
  SELECT steam_id, ref, SUM(added) AS awarded
  FROM `${PROJECT_ID}.${DATASET}.point_history`
  WHERE created_at >= history_since AND reason = 'game_end' AND point_type = 'battle'
  GROUP BY steam_id, ref
),
ordered AS (
  SELECT h.*, COALESCE(l.awarded, 0) AS awarded,
    TIMESTAMP_DIFF(ended_at, LAG(ended_at) OVER (PARTITION BY h.steam_id ORDER BY ended_at), SECOND) AS gap_sec
  FROM history h LEFT JOIN ledger l ON h.steam_id = l.steam_id AND h.game_id = l.ref
),
repeats AS (
  SELECT steam_id, MAX(copies) AS max_identical_stats
  FROM (SELECT steam_id, COUNT(*) AS copies FROM history
        WHERE hero_name IS NOT NULL AND dota_time_msec > 0
          AND (hero_damage > 0 OR kills > 0 OR total_gold_earned > 0)
        GROUP BY steam_id, fingerprint)
  GROUP BY steam_id
),
daily AS (
  SELECT steam_id, COUNTIF(day_points >= 4500) AS near_cap_days
  FROM (SELECT steam_id, DATE(ended_at) AS day, SUM(awarded) AS day_points FROM ordered GROUP BY 1, 2)
  GROUP BY steam_id
),
normal AS (
  SELECT steam_id, COUNT(*) AS accepted_count,
    COUNTIF(battle_points > 500 OR battle_points < 0) AS invalid_raw_points_count,
    COUNTIF(dota_time_msec BETWEEN 0 AND 180000 AND hero_damage = 0 AND kills = 0
      AND battle_points >= 400) AS short_zero_contribution_count,
    SUM(battle_points) AS requested_points,
    SUM(awarded) AS awarded_points,
    COUNTIF(gap_sec BETWEEN 1 AND 14400) AS gap_samples,
    SAFE_DIVIDE(STDDEV_POP(IF(gap_sec BETWEEN 1 AND 14400, gap_sec, NULL)),
      AVG(IF(gap_sec BETWEEN 1 AND 14400, gap_sec, NULL))) AS gap_variation,
    ARRAY_AGG(STRUCT(game_id, ended_at, version, server_type, route, battle_points,
      awarded, dota_time_msec, hero_damage) ORDER BY battle_points DESC LIMIT 5) AS examples
  FROM ordered WHERE ended_at >= since_at GROUP BY steam_id
),
audit AS (
  SELECT steam_id, COUNTIF('cooldown' IN UNNEST(reasons)) AS cooldown_count,
    COUNTIF('points_out_of_range' IN UNNEST(reasons)) AS invalid_points_count,
    ARRAY_AGG(DISTINCT ip IGNORE NULLS LIMIT 20) AS source_ips,
    ARRAY_AGG(STRUCT(game_id, evaluated_at, reasons, requested_points, awarded_points,
      server_type, route, ip, country) ORDER BY evaluated_at DESC LIMIT 5) AS audit_examples
  FROM `${PROJECT_ID}.${DATASET}.game_end_players_audit`
  WHERE evaluated_at >= since_at GROUP BY steam_id
),
signals AS (
  SELECT COALESCE(n.steam_id, a.steam_id) AS steam_id, n.* EXCEPT(steam_id),
    a.* EXCEPT(steam_id), r.max_identical_stats, d.near_cap_days,
    ARRAY_CONCAT(
      IF(COALESCE(invalid_raw_points_count, 0) + COALESCE(invalid_points_count, 0) > 0, ['raw_points_out_of_range'], []),
      IF(r.max_identical_stats >= 3, ['repeated_combat_stats'], []),
      IF(gap_samples >= 5 AND gap_variation < 0.1, ['regular_intervals'], []),
      IF(short_zero_contribution_count >= 3, ['short_zero_contribution_high_points'], []),
      IF(d.near_cap_days >= 3, ['repeated_daily_cap'], []),
      IF(cooldown_count >= 5, ['frequent_cooldown_rejections'], [])
    ) AS flags
  FROM normal n FULL OUTER JOIN audit a USING (steam_id)
  LEFT JOIN repeats r ON r.steam_id = COALESCE(n.steam_id, a.steam_id)
  LEFT JOIN daily d ON d.steam_id = COALESCE(n.steam_id, a.steam_id)
)
SELECT *, ARRAY_LENGTH(flags) AS signal_count
FROM signals
WHERE ARRAY_LENGTH(flags) >= 2
  OR 'raw_points_out_of_range' IN UNNEST(flags)
  OR ('repeated_combat_stats' IN UNNEST(flags) AND max_identical_stats >= 5)
ORDER BY signal_count DESC, requested_points DESC;
