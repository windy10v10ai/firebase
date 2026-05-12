# SQL DB 引入方案文档

记录从 Firestore 引入 SQL DB（Cloud SQL for MySQL）的决策与实施过程。

## 背景

Firestore 按读写次数计费，难以支持战绩历史、近 N 场表现、分析查询等场景。
引入 Cloud SQL for MySQL 作为分析与历史数据存储，Firestore 继续承担聚合主数据。

## 文档索引

| # | 文档 | 状态 |
|---|---|---|
| 01 | [数据库选型与成本方案](./01-database-selection.md) | ✅ 已定 |
| 02 | ORM 选型（Drizzle vs Prisma 7） | 📝 待定 |
| 03 | Schema 设计（GameRecord 等新表） | 📝 待定 |
| 04 | 迁移实施步骤 | 📝 待定 |

## 关键决策摘要

- **数据库**：Cloud SQL for MySQL，asia-northeast1，db-f1-micro 起步
- **存储**：10 GB SSD + 自动备份 + PITR + 单 zone
- **月度成本**：约 ¥2,400（新增），总计约 ¥4,200/月
- **ORM 主力**：Drizzle ORM；备选 Prisma 7
- **不走** Firebase SQL Connect
- **Firestore 保留**作为聚合主数据存储
