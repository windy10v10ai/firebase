-- ============================================
-- 从 GA4 导入历史对局数据到专有表
-- 用途：一次性导入 GA4 事件表中的历史对局数据
-- ============================================
--
-- 执行前准备：
-- 1. 替换 <PROPERTY_ID> 为实际的 GA4 Property ID
-- 2. 确认表已创建（执行 create_tables.sql）
-- 3. 检查时间范围（默认导入最近6个月，可调整）
--
-- 执行方式：
-- 1. 在 BigQuery 控制台执行（替换 <PROPERTY_ID> 后）
-- 2. 或使用 bq 命令行工具：
--    sed 's/<PROPERTY_ID>/YOUR_PROPERTY_ID/g' import_data.sql | \
--    bq query --use_legacy_sql=false
-- ============================================

INSERT INTO `windy10v10ai.dota2.matches`
(
  match_id,
  timestamp,
  winner,
  radiant_heroes,
  dire_heroes,
  duration_msec,
  game_version,
  difficulty,
  server_type,
  recommendation_strategy,
  radiant_player_count,
  dire_player_count
)

WITH parsed_matches AS (
  SELECT
    event_timestamp,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'match_id') as match_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'winner_team_id') as winner,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'difficulty') as difficulty,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'version') as version,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'server_type') as server_type,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') as duration_msec,
    -- 提取所有玩家数据（player_1到player_20）
    ARRAY_CONCAT(
      ARRAY[
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_1'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_2'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_3'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_4'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_5'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_6'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_7'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_8'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_9'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_10')
      ],
      ARRAY[
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_11'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_12'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_13'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_14'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_15'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_16'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_17'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_18'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_19'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_20')
      ]
    ) as players_json
  FROM `windy10v10ai.analytics_<PROPERTY_ID>.events_*`
  WHERE event_name = 'game_end_match'
    -- 导入最近6个月的数据（可调整天数）
    AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
),

extracted_heroes AS (
  SELECT
    match_id,
    TIMESTAMP_MICROS(event_timestamp) as timestamp,
    winner,
    difficulty,
    version as game_version,
    server_type,
    duration_msec,
    -- 提取Radiant英雄
    ARRAY(
      SELECT CAST(JSON_EXTRACT_SCALAR(player_json, '$.hi') AS INT64)
      FROM UNNEST(players_json) as player_json
      WHERE player_json IS NOT NULL
        AND JSON_EXTRACT_SCALAR(player_json, '$.ti') = '2'  -- teamId = 2 (Radiant)
        AND JSON_EXTRACT_SCALAR(player_json, '$.hi') IS NOT NULL
    ) as radiant_heroes,
    -- 提取Dire英雄
    ARRAY(
      SELECT CAST(JSON_EXTRACT_SCALAR(player_json, '$.hi') AS INT64)
      FROM UNNEST(players_json) as player_json
      WHERE player_json IS NOT NULL
        AND JSON_EXTRACT_SCALAR(player_json, '$.ti') = '3'  -- teamId = 3 (Dire)
        AND JSON_EXTRACT_SCALAR(player_json, '$.hi') IS NOT NULL
    ) as dire_heroes
  FROM parsed_matches
  WHERE match_id IS NOT NULL
)

SELECT
  match_id,
  timestamp,
  winner,
  radiant_heroes,
  dire_heroes,
  duration_msec,
  game_version,
  difficulty,
  server_type,
  NULL as recommendation_strategy,  -- 历史数据无此字段，设为NULL
  ARRAY_LENGTH(radiant_heroes) as radiant_player_count,
  ARRAY_LENGTH(dire_heroes) as dire_player_count
FROM extracted_heroes
WHERE
  -- 数据质量过滤
  winner IN (2, 3)
  AND ARRAY_LENGTH(radiant_heroes) >= 1
  AND ARRAY_LENGTH(radiant_heroes) <= 10
  AND ARRAY_LENGTH(dire_heroes) = 10
  -- 去重（如果有重复的match_id）
  AND match_id NOT IN (
    SELECT match_id FROM `windy10v10ai.dota2.matches`
  )
ORDER BY timestamp DESC;

-- ============================================
-- 注意事项：
-- 1. 替换 <PROPERTY_ID> 为实际的 GA4 Property ID
-- 2. 默认导入最近180天数据，可根据需要调整 INTERVAL 180 DAY
-- 3. 执行前建议先 dry-run 查看数据量
-- 4. 导入过程可能需要较长时间，请耐心等待
-- ============================================
