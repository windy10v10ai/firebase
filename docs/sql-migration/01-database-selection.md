# SQL DB 引入 — 数据库选型与成本方案

> 本系列文档记录从 Firestore 引入 SQL DB 的决策过程。本文件为第一步：**数据库与实例规格选型**。
> 后续文档：ORM 选型、Schema 设计、迁移实施等。

## Context

当前后端 Firestore（按读写计费），未来要做：
- 游戏战绩历史（单场明细，目前**未持久化**，仅 GA4 一次性上报）
- 玩家近期表现、近 N 场胜率
- 数据分析、可能的 ML

Firestore 在分析场景的劣势：
- 读次数计费，分析查询线性放大
- 无服务端 GROUP BY，必须拉到内存聚合
  → [api/src/player/player.service.ts:113-142](../../api/src/player/player.service.ts#L113-L142) `getConductPointStats()` 已经在干这件事，自带 `// TODO: 临时统计接口` 注释

**项目背景**：
- 个人开发项目，10k MAU
- 区域：asia-northeast1 (Tokyo)，JPY 计价
- 可容忍偶尔短暂宕机和延迟，**但不能丢数据**
- 控制成本优先

---

## 最终方案

### 数据库

**Cloud SQL for MySQL（直连，不走 Firebase SQL Connect）**

- 实例规格起步：**`db-f1-micro`**
- 存储：**10 GB SSD**（不选 HDD，OLTP 场景 IOPS 重要）
- 区域：asia-northeast1，**单 zone**（不开 HA）
- 必开：**自动每日备份（7 天保留）+ PITR（连续 WAL）+ 自动存储扩容**
- 连接：Cloud Run 通过 [Cloud SQL Node.js Connector](https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector) + 连接池

### ORM

- **主力：Drizzle ORM**
- **备选：Prisma 7**

具体选型在实施阶段再决定，见后续文档。

### 现有架构保持不变

- Firestore 继续作为 Player / Member / 支付订单等聚合主数据存储
- BigQuery export ([extensions/firestore-bigquery-export-*.env](../../extensions/firestore-bigquery-export-players.env)) 不动
- 未来 ML / 数据加工时再考虑把 Cloud SQL 数据导入 BigQuery

---

## 选型决策记录

### 为什么 MySQL 而不是 PostgreSQL

Cloud SQL 上 MySQL 和 PostgreSQL 的**实例/存储/备份/PITR 价格完全相同**，feature 也基本对等。唯一差别：**Firebase SQL Connect 仅支持 PostgreSQL**，但本方案不走 SQL Connect → 该差别无影响。

| 维度 | MySQL | PostgreSQL |
|---|---|---|
| db-f1-micro / g1-small | ✅ | ✅ |
| 价格 | 同 | 同 |
| HDD 存储 | ✅ | ✅ |
| 备份 / PITR / 自动扩容 / Read Replica | ✅ | ✅ |
| Firebase SQL Connect | ❌ | ✅ |
| Window 函数 / 分析查询优化 | 弱 | 强 |
| JSONB 半结构化数据 | 弱 (JSON) | 强 (JSONB + GIN) |

**决定理由**：用户更熟 MySQL，10k MAU 量级 MySQL 性能完全够用。分析层瓶颈可后期走 BigQuery。

### 为什么不走 Firebase SQL Connect

Firebase SQL Connect（原 Data Connect，2026-04 改名）**本质就是托管在 Cloud SQL PostgreSQL 上的 GraphQL 抽象层**。
- 底层 Cloud SQL 实例费**同样计入 GCP 项目账单**（不是 SQL Connect cover；官方文档"包含"表述容易误读）
- 额外只收 ops 费（25 万/月免费内 ≈ 0）
- 核心价值：GraphQL 端点 + 客户端 SDK + Firebase Auth 直通

→ 当前架构已有完整 NestJS API + 自有 Auth，SQL Connect 的抽象层**没有增量价值**，且仅支持 PostgreSQL，与"用 MySQL"的选择冲突。

### 为什么 db-f1-micro 起步

| 规格 | RAM | 月费 (Tokyo, 10GB SSD + 备份 + PITR) | 适用 |
|---|---|---|---|
| **db-f1-micro** | 0.6 GB | **约 ¥2,400** | MVP / 起步（**本次采用**） |
| db-g1-small | 1.7 GB | 约 ¥6,200 | 实际可用的小生产最低规格 |
| db-custom-1-3840 | 3.75 GB | 约 ¥8,000–9,000 | 最便宜的 SLA 覆盖规格 |

**风险与对策**：
- db-f1-micro **不在 Cloud SQL SLA 内**（Google 官方建议"仅 test/dev"）
- 默认 `max_connections = 25`，必须用连接池
- 重 query / autovacuum 可能 OOM
- → 用户能容忍宕机，且 Cloud SQL **支持在线 resize 升级**（停机 1-3 分钟），符合"先省钱、压力上来再升级"的策略

### 为什么 SSD 而不是 HDD

| 存储 | Tokyo 价格 (10GB) | IOPS |
|---|---|---|
| SSD | 约 ¥400/月 | 高 |
| HDD | 约 ¥180/月 | 低 |

10 GB 差价仅 ¥220/月，OLTP 场景 IOPS 远比这点钱重要。

### 数据不丢的保障

| 配置 | 作用 |
|---|---|
| **自动每日备份**（7 天保留）| 基本兜底 |
| **PITR**（连续 binlog/WAL）| 可恢复到秒级 — "不丢数据"的关键 |
| **自动存储扩容** | 防 binlog 撑爆磁盘 |

单 zone + PITR 组合下：zone 故障会有几小时宕机，但**数据不丢**（备份和 binlog 存储在 regional 层）。完全符合"容忍宕机、不丢数据"的需求。

---

## 月度成本汇总（JPY）

### 当前

| 项目 | 月度 |
|---|---|
| Cloud Run + Functions | ¥1,183 |
| BigQuery (Streaming + Storage) | ¥292 |
| Firestore (Read + Write + Backup) | ¥208 |
| 其他 | ¥117 |
| **合计** | **≈ ¥1,800** |

### 引入 Cloud SQL 后

| 项目 | 月度 |
|---|---|
| 现有 | ¥1,800 |
| **+ db-f1-micro (10GB SSD + 备份 + PITR)** | **+¥2,400** |
| **新合计** | **≈ ¥4,200** |

### 后续升级路径

- 压力上来 → resize 到 `db-g1-small`：累计约 **¥8,000/月**
- 需要 SLA → `db-custom-1-3840`：累计约 **¥10,000/月**
- 需要 HA → 实例费 ×2

---

## Cloud Run CPU 计费与 I/O 等待陷阱

### 关键计费机制

Cloud Run / Cloud Run Functions **Request-based billing**（你账单显示的模式）：

> 从请求到达到响应发出的**整个时长**，按"分配的 vCPU × 时长"计费。**不看 CPU 实际利用率，无 I/O wait 豁免**。

参考：[Cloud Run pricing](https://cloud.google.com/run/pricing)、[Billing settings](https://cloud.google.com/run/docs/configuring/billing-settings)

### 现象：CPU 利用率低但 CPU 时长贵

监控截图典型表现：
- 容器 CPU 利用率：5%（低）
- 收费容器实例时间：0.1-0.2 s/s
- 但月度 CPU-秒 累计可观（¥809/月）

**原因**：请求大部分时间在等 Firestore I/O，CPU idle。但 **CPU 利用率与 CPU 计费无关**：
- CPU 利用率 = 分配的 vCPU 被实际占用的比例
- CPU 计费 = 分配的 vCPU × 请求总时长（不管 CPU 在跑还是在等）

### 与 Firestore 延迟强相关

| 操作 | 单次延迟 |
|---|---|
| Cloud Run → Firestore | 30-80ms / 次 |
| Cloud Run → Cloud SQL（同 region）| 2-15ms / 次 |

**当前代码的关键问题**：`game/start` 等接口存在**串行 await Firestore** 模式（见 [api/src/game/game.controller.ts:54-56](../../api/src/game/game.controller.ts#L54-L56)）：

```ts
// 串行：10 个玩家 → 10 × 80ms = 800ms
for (const steamId of steamIds) {
  await this.gameService.upsertPlayerInfo(steamId);
}
```

10 个玩家串行调用 = 单请求 800ms ≈ 0.8 vCPU-秒，CPU 真实工作时间 < 10ms。

### 三种省 CPU 时长的手段（按优先级）

#### ① 立刻可做：`Promise.all` 并发（零成本）

```ts
await Promise.all(
  steamIds.map(id => this.gameService.upsertPlayerInfo(id))
);
```

10 次 Firestore 并行 → 总时长从 800ms 降到 ~80ms。**单接口 CPU 计费降 90%**。
预估月度节省：**¥250-340**（基于 client 函数 ¥809/月 × 估计 50% 在等 I/O）。

#### ② 中期：引入 Cloud SQL 后批量 SQL

```sql
INSERT INTO player (...) VALUES (...),(...),(...) ON DUPLICATE KEY UPDATE ...;
-- 单次 RTT ~10ms 搞定 10 个玩家
```

10 次操作合 1 次 SQL，比 `Promise.all` 再降 50%+。但 Cloud SQL 实例费 **+¥2,400/月**，**净增成本**。

**结论**：MySQL 不应为"省 CPU 时长"引入；引入理由是**新功能**（战绩历史、近 N 场分析）。CPU 节省是顺带收益。

#### ③ 配置层面：Cloud Run vCPU / 内存设置

[Firebase Functions v2 onRequest 配置](../../api/index.ts#L48-L60)：

| 配置 | 当前 | 说明 |
|---|---|---|
| `cpu` | 默认 1 vCPU | 不要降到 < 1，否则 concurrency 被迫 =1，I/O 等待时反而贵 |
| `memory` | 默认 256 MiB | 截图利用率 70-75% 偏紧，加 SQL 后建议升到 512 MiB（+¥37/月）|
| `concurrency` | 默认 80 | **保持**。I/O-heavy 场景下多并发请求共享单实例计费，是天然保护 |

**重要约束**：
- `concurrency > 1` 需要 `cpu ≥ 1`
- `cpu < 1` 时 `concurrency` 必须 =1
- → 你当前默认配置已经是 I/O-heavy 场景的最佳实践，**不要动 cpu/concurrency**

### 不要把 BigQuery 放在请求路径

BigQuery 冷查询 1-3s，同步调用会让单请求 CPU 计费**翻 20 倍**：
- Firestore 100ms 请求 = 0.1 vCPU-s
- BigQuery 2000ms 请求 = 2.0 vCPU-s

→ 分析查询走 **Cloud Scheduler + BigQuery Scheduled Queries** 预聚合，结果写回 Firestore，前端读 Firestore（毫秒级）。

---

## ORM 选型概要

### 主力候选：Drizzle ORM

- **Cloud Run 冷启动最快**（bundle 最轻），契合 db-f1-micro 预算敏感架构
- **SQL-first**，语法贴近 MySQL，熟悉成本低
- TypeScript 原生类型安全
- `drizzle-kit` migration 工具直接
- NestJS 集成走社区模块 `@knaadh/nestjs-drizzle-mysql2`（Trilon 背书）

### 备选：Prisma 7

- 2025 底重写为纯 TS，bundle 从 14MB → 1.6MB，冷启动大幅改善
- **官方 NestJS recipe**，集成最顺
- Schema-driven 开发体验好（schema.prisma 集中定义）
- 适合更看重 DX 和 schema 集中管理的场景

### 不推荐

- TypeORM：query builder / migration 长期 bug，进入"Sustainable"维护模式
- MikroORM：DDD 风格 overkill
- Knex / 原生 mysql2：缺类型安全，仅适合非常简单的场景

→ 具体选型评估见后续 ORM 选型文档。

---

## 关键文件引用

后续实施时定位用：
- 临时全表内存聚合接口：[api/src/player/player.service.ts:113-142](../../api/src/player/player.service.ts#L113-L142)
- 战绩入口 game/end（未来 GameRecord 写入点）：[api/src/game/game.controller.ts:99-130](../../api/src/game/game.controller.ts#L99-L130)
- 现有 BigQuery export 配置：[extensions/firestore-bigquery-export-players.env](../../extensions/firestore-bigquery-export-players.env)、[extensions/firestore-bigquery-export-members.env](../../extensions/firestore-bigquery-export-members.env)
- NestJS Fireorm 现有抽象：[api/src/app.module.ts:33-41](../../api/src/app.module.ts#L33-L41)
