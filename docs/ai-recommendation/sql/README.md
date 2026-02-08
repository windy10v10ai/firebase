# BigQuery SQL 脚本目录

本目录包含 AI 英雄推荐系统的 BigQuery SQL 脚本。

## 📁 文件说明

| 文件                | 用途                | 执行顺序  |
| ------------------- | ------------------- | --------- |
| `create_tables.sql` | 创建对局数据表      | 1️⃣ 先执行 |
| `import_data.sql`   | 从 GA4 导入历史数据 | 2️⃣ 后执行 |

## 🚀 快速开始

### 步骤 1：创建表

```bash
# 方式A：在 BigQuery 控制台执行
# 打开 create_tables.sql，复制内容到 BigQuery 控制台执行

# 方式B：使用 bq 命令行工具
cd docs/ai-recommendation/sql
bq query --use_legacy_sql=false < create_tables.sql
```

### 步骤 2：导入历史数据

**⚠️ 重要：执行前需要替换 `<PROPERTY_ID>`**

```bash
# 方式A：在 BigQuery 控制台执行
# 1. 打开 import_data.sql
# 2. 替换 <PROPERTY_ID> 为实际的 GA4 Property ID
# 3. 复制到 BigQuery 控制台执行

# 方式B：使用 sed + bq 命令行工具
cd docs/ai-recommendation/sql
sed 's/<PROPERTY_ID>/YOUR_PROPERTY_ID/g' import_data.sql | \
  bq query --use_legacy_sql=false
```

## 📊 表结构

创建的表：`windy10v10ai.dota2.matches`

**主要字段**：

- `match_id`: 对局 ID
- `timestamp`: 对局时间
- `winner`: 获胜方（2=Radiant, 3=Dire）
- `radiant_heroes`: Radiant 方英雄数组（1-10 个，可重复）
- `dire_heroes`: Dire 方英雄数组（固定 10 个，不重复）
- `recommendation_strategy`: 推荐策略（用于 AB 测试）

**优化特性**：

- ✅ 按日期分区（`PARTITION BY DATE(timestamp)`）
- ✅ 按 winner 和 difficulty 聚簇（`CLUSTER BY winner, difficulty`）

## ⚙️ 配置说明

### 项目配置

- **项目 ID**: `windy10v10ai`
- **数据集**: `dota2`
- **表名**: `matches`

### GA4 配置

- **Property ID**: 需要替换 `import_data.sql` 中的 `<PROPERTY_ID>`
- **事件名**: `game_end_match`
- **时间范围**: 默认导入最近 180 天（可在 SQL 中调整）

## 🔍 验证数据

执行导入后，可以运行以下查询验证数据：

```sql
-- 查看数据统计
SELECT
  COUNT(*) as total_matches,
  MIN(timestamp) as earliest_match,
  MAX(timestamp) as latest_match,
  AVG(CASE WHEN winner = 3 THEN 1.0 ELSE 0.0 END) as dire_win_rate,
  AVG(ARRAY_LENGTH(radiant_heroes)) as avg_radiant_players,
  AVG(ARRAY_LENGTH(dire_heroes)) as avg_dire_players
FROM `windy10v10ai.dota2.matches`;
```

## 📝 注意事项

1. **执行顺序**：必须先创建表，再导入数据
2. **Property ID**：执行 `import_data.sql` 前必须替换 `<PROPERTY_ID>`
3. **数据量**：导入过程可能需要较长时间，请耐心等待
4. **去重机制**：SQL 会自动过滤已存在的 match_id
5. **数据质量**：只导入符合以下条件的数据：
   - winner 为 2 或 3
   - Radiant 玩家数在 1-10 之间
   - Dire 玩家数固定为 10

## 🔄 后续步骤

1. ✅ 创建表并导入历史数据（当前阶段）
2. 📊 在 BigQuery 代码库中创建数据分析查询
3. 🤖 配置 Dataform 实现自动部署（Phase 2）

---

**最后更新**: 2026-01-14  
**版本**: v1.0
