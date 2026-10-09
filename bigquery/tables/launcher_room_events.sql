CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DATASET}.launcher_room_events` (
  event_time TIMESTAMP NOT NULL,
  event STRING NOT NULL,
  room_id STRING NOT NULL,
  path STRING,
  elapsed_ms INT64,
  host_upnp BOOL NOT NULL,
  host_public_ip BOOL NOT NULL,
  host_symmetric_nat BOOL,
  joiner_upnp BOOL,
  joiner_symmetric_nat BOOL,
  launcher_version STRING NOT NULL,
  country STRING,
  steam_id INT64 NOT NULL,
  host_steam_id INT64 NOT NULL,
  host_relay_rtt_ms INT64,
  host_relay_loss_pct INT64,
  joiner_relay_rtt_ms INT64,
  joiner_relay_loss_pct INT64,
  relay_address STRING,
  ping_sent INT64,
  ping_lost INT64,
  rtt_p50_ms INT64,
  rtt_p95_ms INT64,
  relay_probes ARRAY<STRUCT<address STRING, host_rtt_ms INT64, host_loss_pct INT64, joiner_rtt_ms INT64, joiner_loss_pct INT64>>
)
PARTITION BY DATE(event_time)
CLUSTER BY event;

-- 建表之后加的列，已有的表靠这句补上
ALTER TABLE `${PROJECT_ID}.${DATASET}.launcher_room_events`
  ADD COLUMN IF NOT EXISTS host_relay_rtt_ms INT64,
  ADD COLUMN IF NOT EXISTS host_relay_loss_pct INT64,
  ADD COLUMN IF NOT EXISTS joiner_relay_rtt_ms INT64,
  ADD COLUMN IF NOT EXISTS joiner_relay_loss_pct INT64,
  ADD COLUMN IF NOT EXISTS relay_address STRING,
  ADD COLUMN IF NOT EXISTS ping_sent INT64,
  ADD COLUMN IF NOT EXISTS ping_lost INT64,
  ADD COLUMN IF NOT EXISTS rtt_p50_ms INT64,
  ADD COLUMN IF NOT EXISTS rtt_p95_ms INT64,
  ADD COLUMN IF NOT EXISTS relay_probes ARRAY<STRUCT<address STRING, host_rtt_ms INT64, host_loss_pct INT64, joiner_rtt_ms INT64, joiner_loss_pct INT64>>;
