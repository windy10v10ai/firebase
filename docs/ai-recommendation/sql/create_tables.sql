-- ============================================
-- BigQuery 建表 SQL
-- 用途：创建 AI 英雄推荐系统的对局数据表
-- ============================================
-- 
-- 执行方式：
-- 1. 在 BigQuery 控制台执行
-- 2. 或使用 bq 命令行工具：
--    bq query --use_legacy_sql=false < create_tables.sql
--
-- 项目：windy10v10ai
-- 数据集：dota2
-- 表名：matches
-- ============================================

CREATE TABLE IF NOT EXISTS `windy10v10ai.dota2.matches` (
  -- 核心字段
  match_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,

  -- 对局结果
  winner INT64 NOT NULL,  -- 2=Radiant, 3=Dire

  -- 英雄阵容（ML训练核心特征）
  radiant_heroes ARRAY<INT64> NOT NULL,  -- 长度1-10，可重复
  dire_heroes ARRAY<INT64> NOT NULL,     -- 长度固定10，不重复

  -- 对局元数据
  duration_msec INT64,
  game_version STRING,
  difficulty INT64,
  server_type STRING,

  -- AI推荐相关（用于AB测试和效果评估）
  recommendation_strategy STRING,  -- 'baseline', 'xgboost_v1', 'xgboost_v2', 'random' 等

  -- 统计字段
  radiant_player_count INT64,
  dire_player_count INT64
)
PARTITION BY DATE(timestamp)
CLUSTER BY winner, difficulty
OPTIONS(
  description = "Dota2 10v10 match records for AI hero recommendation",
  require_partition_filter = false
);

-- ============================================
-- 设计要点：
-- ✅ 分区：按日期分区，提高查询效率
-- ✅ 聚簇：按winner和difficulty聚簇，加速训练数据筛选
-- ✅ NOT NULL约束：确保核心字段完整性
-- ✅ 数组类型：直接存储英雄ID数组，无需JOIN
-- ============================================
