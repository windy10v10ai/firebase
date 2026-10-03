CREATE TABLE IF NOT EXISTS `${PROJECT_ID}.${DATASET}.launcher_room_events` (
  event_time TIMESTAMP NOT NULL,
  event STRING NOT NULL,
  room_id STRING NOT NULL,
  path STRING,
  elapsed_ms INT64,
  host_upnp BOOL NOT NULL,
  host_public_ip BOOL NOT NULL,
  joiner_upnp BOOL,
  launcher_version STRING NOT NULL,
  country STRING,
  steam_id INT64 NOT NULL,
  host_steam_id INT64 NOT NULL
)
PARTITION BY DATE(event_time)
CLUSTER BY event;
