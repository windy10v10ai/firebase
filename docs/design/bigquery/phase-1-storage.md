# 第 1 阶段：战绩与积分流水写入 BigQuery

> 状态：设计中。插件升级另见 [#1327](https://github.com/windy10v10ai/firebase/issues/1327)。

现有数据不好做跨局统计：

- **GA4**：每个事件的字段数和字段长度都有上限，存的是 GA4 自己的事件格式，分析前还要先转换一遍
- **Firestore**：只存生涯累计值和最近 50 场
- **BigQuery 插件**：同步的是整份文档的快照，要统计也得先转换

本阶段由 API 在结算和积分变动时，把原始数据直接写进 BigQuery，只负责存。统计与展示放到后续阶段。

## 决定

- **新建数据集 `game_data`，放在 `asia-northeast1`**：和 GA4 导出（`analytics_*`）、插件同步（`firestore_export`）分开，谁写的数据一眼能看出来；和插件放同一个区域，方便跨表联查
- **战绩表一个玩家一局一行，电脑也写**：电脑的 `steam_id` 为 0。跨局平均、英雄与物品分析都要按行分组，一行一人最直接
- **按日期分区，战绩表按 `steam_id`、`difficulty`、`hero_name` 聚类**：查询都会限定时间段，最常见的筛选条件是某个玩家、电脑、难度、英雄，按这几列聚类能少扫数据
- **服务端给每次结算生成 `game_id`，原始 `match_id` 照存**：用启动器开局时 `match_id` 恒为 `"0"`，不能拿来区分不同的局
- **每行另存一份原始报文（JSON 列）**：游戏端以后加了字段，在建新列之前数据也不会丢
- **只在结算被接受后写入，不另做去重**：线上结算全部走本地主机结算和代理结算，两条路径都有 5 分钟冷却，重复发送的请求会被整份拒绝。`/game/end` 本月没有真实流量
- **写法和生涯战绩的累计一致，三条结算路径都覆盖**：挂在同一处，冷却和刷分判断的口径不会分叉。刷分局照样写入，靠 `game_options` 列在查询时筛掉，原始数据不做取舍
- **积分流水在玩家服务的积分写入方法里统一记**：所有积分变动都会经过这里，调用方只需多传「原因」和「关联单号」，不会漏掉某一个入口
- **用 BigQuery 的旧版流式写入（`insertAll`）**：每天约 1.8 万行，每月写入费约 0.06 美元，官方 SDK 一个调用就能写。没选 Storage Write API，因为接入代码复杂得多，这个量级省不下多少钱
- **生产数据不设过期**：长期分析和积分核对都要完整历史。按现在的量一年约 13 GB，超过 90 天没改动的分区自动按长期存储计费，每月不到 1 美元
- **本地开发写同一项目里的 `game_data_dev`，表设 30 天过期**：Firebase 模拟器没有 BigQuery。没选社区模拟器，因为它会忽略分区和聚类，JSON 列的行为也和线上不一致。测试与 CI 不连 BigQuery
- **写入失败只记日志，不影响结算**：和 GA4 上报一样。玩法数据按 MVP 处理
- **积分流水只用来查，不作为对账的依据**：因为写入失败会漏记。充值核对的兜底仍是插件同步的快照，插件不能撤

## 表结构

**`game_end_players`**，按 `ended_at` 按天分区：

| 分组 | 列 |
|---|---|
| 整局 | `game_id`、`match_id`、`ended_at`（服务端收到结算的时间）、`version`、`difficulty`、`server_type`、`route`（`local` / `proxy` / `official`）、`country`、`player_count`、`winner_team_id`、`game_time_msec`、`game_options`（STRUCT） |
| 玩家 | `steam_id`、`team_id`、`hero_name`、`is_winner`、`is_disconnected`、`level`、`score`、`battle_points`、`daily_task_point`、`awaken` |
| 战绩 | `kills`、`deaths`、`assists`、`last_hits`、`hero_damage`、`damage_taken`、`healing`、`tower_kills`、`total_gold_earned`、`stuns`、`roshan_kills`、`strength`、`agility`、`intellect` |
| 出装与技能 | `items`（ARRAY）、`neutral_item`、`neutral_passive_item`、`abilities`（ARRAY） |
| 原始 | `raw`（JSON：整局字段加上该玩家的条目） |

**`point_ledger`**，按 `created_at` 按天分区，按 `steam_id` 聚类：

| 列 | 说明 |
|---|---|
| `created_at`、`steam_id` | 什么时候、谁 |
| `point_type` | `battle` / `member` |
| `field` | `total`（获得）/ `used`（消耗） |
| `delta` | 本次变动量，可正可负 |
| `total_after`、`used_after` | 变动后这种积分的累计与已用 |
| `reason` | 结算、会员每日积分、会员开通、活动奖励、支付宝、爱发电、Ko-fi、属性加点、觉醒、游戏内消耗会员积分等 |
| `ref` | 关联单号：结算的 `game_id` 或支付订单号，没有就留空 |

## 不做

- 不从 GA4 的历史数据导入：放到后续阶段，是否需要看统计的需求
- 不处理代理结算拼不成整局的问题：代理结算一条请求只有一个玩家，各行的 `game_id` 各不相同，也没有电脑的数据
- 不记直接改数据库的积分变动：比如账号迁移脚本、控制台手动修改，这些由插件的快照兜底
- 接口不直接查 BigQuery：冷查询要 1–3 秒，展示用的统计先预先算好、写回 Firestore，见 [docs/api/README.md](../../api/README.md)「成本与延迟」

## 后续事项

- 建 `game_data` 与 `game_data_dev` 两个数据集和各自的两张表、给云函数的服务账号开 `game_data` 的写权限：这两步会改线上环境，执行前要确认
- 实现合入时，把「分析数据以 `game_data` 为准」和两张表的结构写进 `docs/api/`，本文只保留取舍
- 第 2 阶段：全体平均值和积分统计的预先汇总、六边形图与综合评分、按时间段和难度的积分统计
