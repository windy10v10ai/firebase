---
name: cheat-handling
description: 处理刷分、重放结算、篡改上报积分的账户时加载——用户给出 Steam ID 要求「处罚」「清空积分」「记录到封禁表」，或结算异常定时检查报出可疑账户之后。包含取证、处罚范围、生产库写入、记录表格与玩家公告。
---

# 结算作弊账户处理

异常**发现**交给结算异常检查（`bigquery/queries/settlement-anomalies.sql` 与定时任务），本 skill 管**处理**：取证、定范围、写生产库、记表格、发公告。检查任务只汇报可疑账户，不动数据；写生产库一律在用户确认之后。

默认处罚是**清空勇士进度，保留会员权益**。封号不在本流程内，由用户自己做。

## 步骤

### 1. 取证，以最新数据为准

只读，用 `gcloud auth print-access-token` + Firestore REST（`projects/windy10v10ai/databases/(default)/documents/<集合>/<SteamID>`）读 `Players`、`Members`、`PlayerProperties`、`PlayerHeroAwakenings`。字段关系：

| 数据 | 关系 |
|---|---|
| `Players.usedLevel` | 等于 `PlayerProperties.properties` 各项 `level` 之和 |
| `Players.usedSeasonPoint` / `usedMemberPoint` | 分别等于觉醒项里 `usedSeasonPoint` / `usedMemberPoint` 之和，加上历史重置扣费 |
| `PlayerHeroAwakenings` | 文档可能不存在，不存在即无觉醒 |

再用 BigQuery（`bq query --use_legacy_sql=false --project_id=windy10v10ai`，数据集 `game_data`）查 `point_history`（积分流水）、`game_end_players`（每局上报）、`game_end_players_audit`（结算审计）。这三张表是尽力写入的，缺行不等于没发生；`point_history` 与审计表只有建表之后的记录，更早的积分来源查不到，要如实写进汇报。

完成条件：这个账户每个集合的当前值、近期每局到账与上报值都已列出，哪些查不到已注明。

### 2. 定范围

按用户的话定，不自己加重或减轻。下面几种情况**先问用户**：

- 证据只有版本号或报文里的账户 ID：这两样不能证明操作者身份，问是否仍处罚、公告是否点名。
- 账户有会员或付费历史：说明保留哪些，订单是否核对由用户定。
- 用户只说「清空积分」：问清是否连加点和觉醒一起清。

完成条件：清哪些、留哪些的清单已被用户确认。

### 3. 给前后对比，等许可

列出每项处理前的数值和处理后的数值，用户回复确认后才写入。

### 4. 写生产库并回读

先把要改的文档存一份到 scratchpad 备份，再用 `updateMask` 只改目标字段（`PATCH …?updateMask.fieldPaths=…`）：

- `Players`：`seasonPointTotal`、`usedSeasonPoint`、`usedLevel` 置 0。会员积分与 `usedMemberPoint` 不动。
- `PlayerProperties`：`properties` 置空数组，保留文档。
- `PlayerHeroAwakenings`：只删勇士积分（`usedSeasonPoint`）购买的项，会员积分购买的项保留。

写入被权限检查拦住时，停下向用户说明要做什么，不换写法绕过。

完成条件：回读的每个目标字段都与处理后清单一致，不该动的字段（会员积分、对局数、行为分、每日任务、活动领取、生涯统计）值未变。

### 5. 记录到表格

表格 `1mmbKCbeeYP6ykk6bQ2z5Jf-TGza4oNUQ8XwsLg65Fk4`（封禁玩家列表），工作表按年命名（`2026年`），一个账户一行：

日期（日本时间）| 玩家ID | 判定 | 问题背景 | 实际处理措施 | 处理结果

- 问题背景、措施、结果各分条换行，一行一个事实，不写长句；结果分「处理前」「处理后」两块给数值。
- 写入后对该行设 `wrapStrategy: WRAP`、顶对齐，再自动调整行高。`fields` 写成 `userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment`。
- 没核对的事项（如付费订单）写进措施，不留空。

完成条件：新行六列齐全，结果列的前后数值与第 4 步回读一致。

### 6. 玩家公告（用户要时）

游戏公告口吻，不写「账户」「处罚措施」这类书面语，不写手法与具体数值。模板：

> 近期有账户（380\*\*\*\*964、110\*\*\*\*173）试图攻击服务器、伪造篡改数据，已被查实并封禁。
> 数据日志都有记录，大数据 AI 随时核查，作弊必被发现。请大家公平游戏。

英文同意译。发布前核对三点：

- 写「封禁」之前，确认账号确实已封；只清了进度就如实说「已处理」。
- ID 默认打码，证据只有重放特征时尤其如此。
- 只说「随时核查」，不承诺固定周期。
