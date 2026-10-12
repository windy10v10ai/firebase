CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DATASET}.game_perf` (
  game_id STRING NOT NULL,
  match_id STRING,
  ended_at TIMESTAMP NOT NULL,
  version STRING,
  difficulty INT64,
  server_type STRING,
  route STRING,
  host STRING,
  player_count INT64,
  dota_time_msec INT64,
  real_sec FLOAT64,
  units INT64,
  modifiers INT64,
  segments ARRAY<STRUCT<
    ratio FLOAT64,
    units INT64,
    modifiers INT64
  >>,
  raw JSON
)
PARTITION BY DATE(ended_at)
CLUSTER BY host, route;
