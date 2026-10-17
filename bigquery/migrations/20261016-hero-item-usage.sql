ALTER TABLE `${PROJECT_ID}.${DATASET}.game_end_players`
ADD COLUMN IF NOT EXISTS custom_match_id STRING;

ALTER TABLE `${PROJECT_ID}.${DATASET}.game_end_players`
RENAME COLUMN IF EXISTS game_time_msec TO dota_time_msec;

ALTER TABLE `${PROJECT_ID}.${DATASET}.game_perf`
ADD COLUMN IF NOT EXISTS custom_match_id STRING;
