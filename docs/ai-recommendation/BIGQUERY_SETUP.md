# BigQuery专有表设计与数据导入方案

## 1. 创建专有表

```sql
-- 在BigQuery控制台执行
-- 或通过 bq 命令行工具

CREATE TABLE `windy10v10ai.dota2.matches` (
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
```

**设计要点**：
- ✅ **分区**：按日期分区，提高查询效率
- ✅ **聚簇**：按winner和difficulty聚簇，加速训练数据筛选
- ✅ **NOT NULL约束**：确保核心字段完整性
- ✅ **数组类型**：直接存储英雄ID数组，无需JOIN

---

## 2. 从GA4导入历史数据

### 方式A：一次性导入（推荐）

创建SQL文件 `ml/data/import_ga4_to_dedicated_table.sql`：

```sql
-- ml/data/import_ga4_to_dedicated_table.sql
-- 从GA4事件表导入历史对局数据到专有表

INSERT INTO `windy10v10ai.dota2.matches`
(
  match_id,
  timestamp,
  winner,
  radiant_heroes,
  dire_heroes,
  duration_msec,
  game_version,
  difficulty,
  server_type,
  recommendation_strategy,
  radiant_player_count,
  dire_player_count
)

WITH parsed_matches AS (
  SELECT
    event_timestamp,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'match_id') as match_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'winner_team_id') as winner,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'difficulty') as difficulty,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'version') as version,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'server_type') as server_type,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') as duration_msec,
    -- 提取所有玩家数据（player_1到player_20）
    ARRAY_CONCAT(
      ARRAY[
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_1'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_2'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_3'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_4'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_5'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_6'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_7'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_8'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_9'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_10')
      ],
      ARRAY[
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_11'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_12'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_13'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_14'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_15'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_16'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_17'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_18'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_19'),
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'player_20')
      ]
    ) as players_json
  FROM `windy10v10ai.analytics_<PROPERTY_ID>.events_*`
  WHERE event_name = 'game_end_match'
    -- 导入最近6个月的数据（可调整）
    AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
),

extracted_heroes AS (
  SELECT
    match_id,
    TIMESTAMP_MICROS(event_timestamp) as timestamp,
    winner,
    difficulty,
    version as game_version,
    server_type,
    duration_msec,
    -- 提取Radiant英雄
    ARRAY(
      SELECT CAST(JSON_EXTRACT_SCALAR(player_json, '$.hi') AS INT64)
      FROM UNNEST(players_json) as player_json
      WHERE player_json IS NOT NULL
        AND JSON_EXTRACT_SCALAR(player_json, '$.ti') = '2'  -- teamId = 2 (Radiant)
        AND JSON_EXTRACT_SCALAR(player_json, '$.hi') IS NOT NULL
    ) as radiant_heroes,
    -- 提取Dire英雄
    ARRAY(
      SELECT CAST(JSON_EXTRACT_SCALAR(player_json, '$.hi') AS INT64)
      FROM UNNEST(players_json) as player_json
      WHERE player_json IS NOT NULL
        AND JSON_EXTRACT_SCALAR(player_json, '$.ti') = '3'  -- teamId = 3 (Dire)
        AND JSON_EXTRACT_SCALAR(player_json, '$.hi') IS NOT NULL
    ) as dire_heroes
  FROM parsed_matches
  WHERE match_id IS NOT NULL
)

SELECT
  match_id,
  timestamp,
  winner,
  radiant_heroes,
  dire_heroes,
  duration_msec,
  game_version,
  difficulty,
  server_type,
  NULL as recommendation_strategy,  -- 历史数据无此字段，设为NULL
  ARRAY_LENGTH(radiant_heroes) as radiant_player_count,
  ARRAY_LENGTH(dire_heroes) as dire_player_count
FROM extracted_heroes
WHERE
  -- 数据质量过滤
  winner IN (2, 3)
  AND ARRAY_LENGTH(radiant_heroes) >= 1
  AND ARRAY_LENGTH(radiant_heroes) <= 10
  AND ARRAY_LENGTH(dire_heroes) = 10
  -- 去重（如果有重复的match_id）
  AND match_id NOT IN (
    SELECT match_id FROM `windy10v10ai.dota2.matches`
  )
ORDER BY timestamp DESC;
```

**执行步骤**：

```bash
# 1. 替换 <PROPERTY_ID> 为实际的GA4 Property ID
sed 's/<PROPERTY_ID>/YOUR_PROPERTY_ID/g' ml/data/import_ga4_to_dedicated_table.sql > ml/data/import_temp.sql

# 2. 执行导入（通过bq命令行）
bq query --use_legacy_sql=false < ml/data/import_temp.sql

# 或在BigQuery控制台直接粘贴执行
```

### 方式B：Python脚本导入（更灵活）

创建 `ml/data/import_ga4_data.py`：

```python
# ml/data/import_ga4_data.py
"""
从GA4事件表导入历史数据到专有表
"""
from google.cloud import bigquery
import argparse
from datetime import datetime

def import_ga4_data(property_id: str, days: int = 180, dry_run: bool = False):
    """
    从GA4导入历史数据

    Args:
        property_id: GA4 Property ID
        days: 导入最近N天的数据
        dry_run: 只统计数据量，不实际导入
    """
    client = bigquery.Client()

    # 读取SQL模板
    with open('import_ga4_to_dedicated_table.sql', 'r') as f:
        query = f.read()

    # 替换参数
    query = query.replace('<PROPERTY_ID>', property_id)
    query = query.replace('INTERVAL 180 DAY', f'INTERVAL {days} DAY')

    if dry_run:
        # 只统计数据量
        count_query = f"""
        SELECT COUNT(*) as total
        FROM ({query.replace('INSERT INTO', 'SELECT * FROM')})
        """
        result = client.query(count_query).result()
        total = list(result)[0]['total']
        print(f"📊 将导入 {total:,} 场对局数据")
        return total

    # 执行导入
    print(f"🚀 开始导入数据...")
    job = client.query(query)
    result = job.result()

    print(f"✅ 导入完成！")
    print(f"   - 插入行数: {job.num_dml_affected_rows:,}")
    print(f"   - 处理字节: {job.total_bytes_processed:,}")

    # 验证数据
    verify_query = """
    SELECT
      COUNT(*) as total_matches,
      MIN(timestamp) as earliest_match,
      MAX(timestamp) as latest_match,
      AVG(CASE WHEN winner = 3 THEN 1.0 ELSE 0.0 END) as dire_win_rate,
      AVG(ARRAY_LENGTH(radiant_heroes)) as avg_radiant_players,
      AVG(ARRAY_LENGTH(dire_heroes)) as avg_dire_players
    FROM `windy10v10ai.dota2.matches`
    """

    verify_result = client.query(verify_query).result()
    stats = list(verify_result)[0]

    print(f"\n📈 数据统计:")
    print(f"   - 总对局数: {stats['total_matches']:,}")
    print(f"   - 时间范围: {stats['earliest_match']} ~ {stats['latest_match']}")
    print(f"   - Dire胜率: {stats['dire_win_rate']:.2%}")
    print(f"   - Radiant平均人数: {stats['avg_radiant_players']:.1f}")
    print(f"   - Dire平均人数: {stats['avg_dire_players']:.1f}")

    return stats['total_matches']

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='从GA4导入历史对局数据')
    parser.add_argument('--property-id', required=True, help='GA4 Property ID')
    parser.add_argument('--days', type=int, default=180, help='导入最近N天的数据')
    parser.add_argument('--dry-run', action='store_true', help='只统计，不实际导入')

    args = parser.parse_args()

    import_ga4_data(
        property_id=args.property_id,
        days=args.days,
        dry_run=args.dry_run
    )
```

**使用方法**：

```bash
# 1. 先dry-run看数据量
python ml/data/import_ga4_data.py \
  --property-id YOUR_PROPERTY_ID \
  --days 180 \
  --dry-run

# 2. 确认后执行导入
python ml/data/import_ga4_data.py \
  --property-id YOUR_PROPERTY_ID \
  --days 180
```

---

## 3. 持续数据写入（NestJS）

在导入历史数据后，新对局自动写入专有表。

### BigQueryService实现

```typescript
// api/src/bigquery/bigquery.service.ts
import { BigQuery } from '@google-cloud/bigquery';
import { Injectable, Logger } from '@nestjs/common';
import { GameEndMatchDto } from '../analytics/dto/game-end-dto';
import { GetHeroId } from '../analytics/data/hero-data';

@Injectable()
export class BigQueryService {
  private readonly logger = new Logger(BigQueryService.name);
  private bigquery = new BigQuery();
  private dataset = this.bigquery.dataset('dota2');
  private table = this.dataset.table('matches');

  async saveMatch(gameEnd: GameEndMatchDto): Promise<void> {
    try {
      // 提取Radiant英雄
      const radiantHeroes = gameEnd.players
        .filter(p => p.teamId === 2)
        .map(p => GetHeroId(p.heroName));

      // 提取Dire英雄
      const direHeroes = gameEnd.players
        .filter(p => p.teamId === 3)
        .map(p => GetHeroId(p.heroName));

      // 数据验证
      if (direHeroes.length !== 10) {
        this.logger.warn(
          `Invalid dire hero count: ${direHeroes.length}, match_id: ${gameEnd.matchId}`
        );
        return;
      }

      if (radiantHeroes.length < 1 || radiantHeroes.length > 10) {
        this.logger.warn(
          `Invalid radiant hero count: ${radiantHeroes.length}, match_id: ${gameEnd.matchId}`
        );
        return;
      }

      // 构造行数据
      const row = {
        match_id: gameEnd.matchId,
        timestamp: new Date().toISOString(),
        winner: gameEnd.winnerTeamId,
        radiant_heroes: radiantHeroes,
        dire_heroes: direHeroes,
        duration_msec: gameEnd.gameTimeMsec,
        game_version: gameEnd.version,
        difficulty: gameEnd.difficulty,
        server_type: 'production',
        recommendation_strategy: gameEnd.recommendationStrategy || null,  // 'baseline', 'xgboost_v1', etc.
        radiant_player_count: radiantHeroes.length,
        dire_player_count: direHeroes.length,
      };

      // 插入BigQuery
      await this.table.insert([row]);

      this.logger.log(
        `Match saved to BigQuery: ${gameEnd.matchId}, winner: ${gameEnd.winnerTeamId}`
      );
    } catch (error) {
      this.logger.error('Failed to save match to BigQuery', error);
      // 不抛出异常，避免影响GA4流程
    }
  }
}
```

### 集成到Analytics Service

```typescript
// api/src/analytics/analytics.service.ts
import { BigQueryService } from '../bigquery/bigquery.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly bigQueryService: BigQueryService,
    // ... 其他依赖
  ) {}

  async gameEndMatch(gameEnd: GameEndMatchDto, serverType: SERVER_TYPE) {
    // 现有：发送到GA4
    await this.sendToGA4(gameEnd);

    // 新增：写入BigQuery专有表
    if (process.env.ENABLE_BIGQUERY_EXPORT === 'true') {
      await this.bigQueryService.saveMatch(gameEnd);
    }
  }
}
```

---

## 4. 统一的数据加载器（ML训练）

导入后，只需要一个简单的数据加载器：

```python
# ml/training/data_loader.py
from google.cloud import bigquery
import pandas as pd

class MatchDataLoader:
    def __init__(self, project_id='windy10v10ai'):
        self.client = bigquery.Client(project=project_id)

    def load_recent_matches(self, days=90):
        """从专有表加载对局数据"""
        query = f"""
        SELECT
          match_id,
          timestamp,
          winner,
          radiant_heroes,
          dire_heroes,
          duration_msec,
          game_version,
          difficulty,
          server_type,
          radiant_player_count,
          dire_player_count
        FROM `windy10v10ai.dota2.matches`
        WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)
          AND radiant_player_count >= 1
          AND radiant_player_count <= 10
          AND dire_player_count = 10
        ORDER BY timestamp DESC
        """

        df = self.client.query(query).to_dataframe()
        return df

    def get_data_stats(self, df):
        """打印数据统计"""
        print(f"📊 数据统计:")
        print(f"   总对局数: {len(df):,}")
        print(f"   时间范围: {df['timestamp'].min()} ~ {df['timestamp'].max()}")
        print(f"   Dire胜率: {(df['winner'] == 3).mean():.2%}")
        print(f"   Radiant平均人数: {df['radiant_player_count'].mean():.1f}")

        # 英雄选择频率
        from collections import Counter
        all_radiant = [h for heroes in df['radiant_heroes'] for h in heroes]
        all_dire = [h for heroes in df['dire_heroes'] for h in heroes]

        print(f"   Radiant最常选英雄: {Counter(all_radiant).most_common(5)}")
        print(f"   Dire最常选英雄: {Counter(all_dire).most_common(5)}")

# 使用示例
if __name__ == '__main__':
    loader = MatchDataLoader()
    df = loader.load_recent_matches(days=90)
    loader.get_data_stats(df)
```

---

## 5. 执行清单

### 步骤1: 创建表（10分钟）
```bash
# 在BigQuery控制台执行建表SQL
# 或使用bq命令行
bq mk --table \
  windy10v10ai:dota2.matches \
  ml/data/schema.json
```

### 步骤2: 导入历史数据（30分钟）
```bash
# 方式A: 直接执行SQL
bq query --use_legacy_sql=false < ml/data/import_ga4_to_dedicated_table.sql

# 方式B: Python脚本
python ml/data/import_ga4_data.py --property-id YOUR_ID --dry-run
python ml/data/import_ga4_data.py --property-id YOUR_ID
```

### 步骤3: 验证数据（5分钟）
```sql
-- 在BigQuery控制台执行
SELECT
  COUNT(*) as total,
  MIN(timestamp) as earliest,
  MAX(timestamp) as latest,
  AVG(CASE WHEN winner = 3 THEN 1.0 ELSE 0.0 END) as dire_win_rate
FROM `windy10v10ai.dota2.matches`;
```

### 步骤4: 配置持续写入（20分钟）
```bash
# 1. 实现BigQueryService（已有代码）
# 2. 设置环境变量
export ENABLE_BIGQUERY_EXPORT=true

# 3. 部署到Firebase Functions
firebase deploy --only functions:client
```

---

## 6. 预期数据量

假设：
- 每月对局：100,000场
- 历史数据：6个月
- 总数据量：约600,000场对局

**BigQuery成本估算**：
- 存储：600k × 500字节 ≈ 300MB → $0.006/月
- 查询（训练）：每次扫描300MB → 免费额度内（1TB/月免费）

---

## 优势总结

✅ **统一数据源**：历史数据和新数据在同一张表，无需两套加载器
✅ **高效查询**：分区+聚簇，查询速度快
✅ **数据质量**：导入时过滤，确保训练数据干净
✅ **可扩展性**：新字段（如玩家等级）可以轻松添加
✅ **成本低**：完全在BigQuery免费额度内
