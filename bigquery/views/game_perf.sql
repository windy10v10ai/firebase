-- 看板「卡顿（结算上报）」用的明细，分位数由看板按筛选现算

-- 一局一行；不到 10 分钟的局比值波动大，不计
CREATE OR REPLACE VIEW `${PROJECT_ID}.${DATASET}.game_perf_matches` AS
SELECT
  game_id,
  ended_at,
  DATE(ended_at) AS day,
  version,
  difficulty,
  CONCAT(
    -- 早期的启动器单人服记成 dedicated
    IF(host IN ('launcher', 'dedicated'), '服务器', '游廊'),
    IF(player_count > 1, '组队', '单人')
  ) AS game_type,
  player_count,
  dota_time_msec,
  real_sec * 1000 / dota_time_msec AS ratio,
  IF(real_sec * 1000 / dota_time_msec > 1.1, 1, 0) AS laggy,
  units,
  modifiers,
  segments
FROM `${PROJECT_ID}.${DATASET}.game_perf`
WHERE dota_time_msec >= 600000;

-- 一段一行，单位与 modifier 取段末计数
CREATE OR REPLACE VIEW `${PROJECT_ID}.${DATASET}.game_perf_segments` AS
SELECT
  m.game_id,
  m.ended_at,
  m.day,
  m.version,
  m.game_type,
  (idx + 1) * 5 AS segment_end_min,
  seg.ratio,
  IF(seg.ratio > 1.1, 1, 0) AS laggy,
  -- 前缀数字让看板按字母序排出轻重顺序
  CASE
    WHEN seg.ratio <= 1.05 THEN '1 正常（≤1.05）'
    WHEN seg.ratio <= 1.2 THEN '2 轻微卡（1.05–1.2）'
    ELSE '3 卡（>1.2）'
  END AS lag_level,
  seg.units,
  seg.modifiers
FROM `${PROJECT_ID}.${DATASET}.game_perf_matches` AS m, UNNEST(m.segments) AS seg WITH OFFSET idx;
