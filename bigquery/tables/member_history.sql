CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DATASET}.member_history` (
  created_at TIMESTAMP NOT NULL,
  steam_id INT64 NOT NULL,
  purchased_level INT64 NOT NULL,
  months INT64 NOT NULL,
  level_before INT64,
  expire_date_before DATE,
  level_after INT64 NOT NULL,
  expire_date_after DATE NOT NULL,
  reason STRING NOT NULL,
  ref STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY steam_id;
