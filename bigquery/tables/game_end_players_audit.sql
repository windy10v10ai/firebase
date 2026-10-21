CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DATASET}.game_end_players_audit` (
  evaluated_at TIMESTAMP NOT NULL,
  game_id STRING NOT NULL,
  match_id STRING,
  steam_id INT64 NOT NULL,
  version STRING,
  server_type STRING,
  route STRING,
  ip STRING,
  country STRING,
  accepted BOOL NOT NULL,
  reasons ARRAY<STRING>,
  requested_points FLOAT64,
  awarded_points FLOAT64,
  raw STRING
)
PARTITION BY DATE(evaluated_at)
CLUSTER BY steam_id, server_type;
