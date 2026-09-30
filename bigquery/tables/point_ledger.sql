CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DATASET}.point_ledger` (
  created_at TIMESTAMP NOT NULL,
  steam_id INT64 NOT NULL,
  point_type STRING NOT NULL,
  field STRING NOT NULL,
  delta INT64 NOT NULL,
  total_after INT64,
  used_after INT64,
  reason STRING NOT NULL,
  ref STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY steam_id;
