CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DATASET}.hero_item_usage` (
  recorded_at TIMESTAMP NOT NULL,
  custom_match_id STRING,
  version STRING,
  difficulty INT64,
  dota_time_msec INT64,
  player_count INT64,
  player_id INT64,
  steam_id INT64,
  hero_name STRING,
  team_id INT64,
  is_win BOOL,
  items ARRAY<STRUCT<item_name STRING, duration_sec INT64, late_duration_sec INT64>>
)
PARTITION BY DATE(recorded_at)
CLUSTER BY hero_name, difficulty;
