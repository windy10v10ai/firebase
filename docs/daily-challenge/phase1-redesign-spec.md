# 每日挑战 Phase1 重新设计

日期：2026-08-10
状态：待评审
替代：PR #1040（firebase）+ PR #2310（game）的后端设计

## 1. 背景

现有实现把四个玩法（个人任务、全服共同任务、连续完成、付费刷新）一次性做完，代价是：

- 7 个 Firestore collection，开局 10 人需要 40+ 次读
- 5 状态挑战日状态机（`OPEN → CLOSING → FROZEN → REWARDING → SETTLED`），寄生在 `/game/start` 上补结算
- 4 个互相无序的快照推送来源，逼出客户端三层防回退逻辑
- 客户端 6 个采集模块约 1700 行（含测试），只为 12 个 `/game/end` 尚未提供的指标
- 4 套版本号（`schemaVersion` / `dataVersion` / `configVersion` / 客户端镜像），其中 `configVersion` 在三处语义不一致

大量状态服务的是派生值和跨天协调。本设计把范围收敛到个人任务，并用"确定性重算"替代"落库冻结"。

## 2. 分期

| 阶段 | 内容 |
| --- | --- |
| **Phase1**（本 spec） | 只有个人任务 |
| Phase2 | 连续完成 |
| Phase3 | 全服共同任务 |

付费刷新**不进入任何阶段**，直接删除。

Phase1 不为 Phase2/3 预留任何字段或接口位。接口不做版本管理，新增字段天然向下兼容。

## 3. 玩法定义

### 3.1 一天的循环

每天 3 轮。每轮玩家面对 3 个候选任务（2 个通用 + 1 个英雄专属），自由选一个去完成。

- 候选在 `/game/start` 时由服务端生成并随响应下发
- 玩家在客户端本地选择，**不产生任何 API 调用**
- `/game/end` 上报"我完成的是哪个任务"，服务端验证并结算
- 完成一轮后，下一轮候选在**下一次** `/game/start` 生成；同一局内不推进第二轮
- 未完成时候选不变，玩家下一局可以改选同一组里的另一个

### 3.2 进度模型

**单局达标才算完成，不跨局累积。** 目标值必须按"单局可达"标定。

因此不存在"接取"概念，也不存在 `progress` 字段。客户端局内显示的进度条是本地计算的展示，服务端不参与。

### 3.3 星级

每个候选独立掷一个星级，决定目标与奖励：

| 星级 | 目标倍率 | 赛季积分 |
| --- | --- | --- |
| 1★ | 0.75 | 60 |
| 2★ | 1.0 | 80 |
| 3★ | 1.5 | 100 |

单日个人赛季积分上限 300（三轮全 3★）。

星级由 seed 确定性掷出，权重 1:1:1。毫秒类指标 Phase1 不使用，因此取整规则简化为 `Math.max(1, Math.round(target * multiplier))`。

### 3.4 英雄专属任务

每轮 3 个候选中固定 1 个是英雄专属，要求本局英雄与任务 `heroName` 一致才计入。

### 3.5 已删除的机制

| 机制 | 处置 |
| --- | --- |
| 付费刷新 | 删除。连带 `daily_challenge_operation_ledger` 和 `requestId` 幂等机制一起消失——刷新是唯一"重复执行会扣钱"的操作 |
| 10 分钟接取窗口 | 删除。作弊面被限制在"3 个固定候选里挑最有利的一个"，这本就是三选一的设计意图 |
| 连续完成 | 移到 Phase2 |
| 全服共同任务 | 移到 Phase3。连带挑战日状态机、`daily_challenge_days` / `global_contributions` / `global_rankings` 三个 collection、`reconcile()` 补结算全部消失 |
| 未读红点 / 奖励历史面板 | 删除 `POST /view`。历史改为 `history` 数组，随开局快照下发 |

## 4. 责任划分

### 4.1 客户端（game 仓库）

- **全部文案**：`addon_schinese/english/russian.txt`，按 `scope` + `metric` 拼本地化 key，替换 `{hero}` / `{target}`。英雄名走 DOTA 自带的 `#npc_dota_hero_*`
- **候选选择**：本地状态，零网络请求
- **局内进度展示**：本地计算，从不上报、从不持久化
- **`/game/end` 上报**：在已有的 `players[i]` 对象上多发一个 `dailyChallengeTaskId` 字符串
- **UI**：HUD 入口、挑战面板、候选卡、星级徽章、今日记录、历史列表、结算页积分

**客户端不需要写任何指标采集代码。** Phase1 的全部指标已经在 `/game/end` 的 `GameEndPlayerDto` 里。

### 4.2 API

- 挑战日归属（服务器本地零点，`YYYY-MM-DD`）
- 候选生成与星级掷点（确定性）
- 达标判定与赛季积分发放
- 跨天局归属与迟到回写
- 单局幂等

## 5. 指标范围

Phase1 只使用 `GameEndPlayerDto` 已有的字段，客户端无需新增采集，也不需要 `dataVersion` 门控：

| metric | `GameEndPlayerDto` 字段 |
| --- | --- |
| `kills` | `kills` |
| `assists` | `assists` |
| `last_hits` | `lastHits` |
| `hero_damage` | `heroDamage` |
| `damage_taken` | `damageTaken` |
| `healing` | `healing` |
| `tower_kills` | `towerKills` |

被移出 Phase1 的 12 个指标：`physical/magical/pure_damage`、`bot_kills`、`roshan_kills`、7 个控制时长。它们各自需要客户端的 `damage-observer` 或 `modifier-classifier`，等 Phase2/3 有明确需求时再单独立项。

**额外收益**：每日挑战与 analytics、`playerStatsLifetime` 使用同一份数字，不再存在"客户端另算一份 `personalMetrics` 与 `players[].heroDamage` 对不上"的问题。

`/game/end` 经 `x-api-key` 校验，数据可信。删除 `DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION` 上限表和 `isReasonableContribution()`，只保留 class-validator 的 `@Min(0)`。

## 6. 数据模型

每日挑战**只新增一个 collection**。赛季积分仍写入既有的 `Players` collection（见 8.3）。

```ts
// api/src/daily-challenge/entities/player-daily-challenge.entity.ts
@Collection('player_daily_challenges')
export class PlayerDailyChallenge {
  id: string;          // = steamId.toString()
  steamId: number;
  dayId: string;       // 'YYYY-MM-DD'，读到时若 !== 今天则触发跨天重置

  todayCompleted: DailyChallengeCompletion[];   // 今天已完成，长度 0~3
  processedMatchIds: string[];                  // 单局幂等，保留最近 10 个
  history: DailyChallengeHistoryEntry[];        // 最近 30 天，最新在前

  updatedAt: Date;
}

export interface DailyChallengeCompletion {
  taskId: string;
  star: DailyChallengePersonalStar;
  seasonPoint: number;
  matchId: string;
}

export interface DailyChallengeHistoryEntry {
  dayId: string;
  rounds: number;        // 当天完成轮数
  seasonPoint: number;   // 当天获得赛季积分
}
```

文档数固定等于玩家数，永不增长。

### 6.1 候选不落库

候选由 `(dayId, steamId, round)` 确定性生成——taskId、星级、目标、奖励全部可重算。因此不存 `candidates`、不存 `star`、不存 `target`。

跨天迟到的 `/game/end` 也靠重算验证：上报 `dayId=昨天` 时，用昨天的 dayId 重新生成候选来验证 `taskId`，不需要保留任何昨天的快照。

**运维约束（用约定替代 `configVersion`）**：已上线任务的 `id` 与 `metric` 不得修改；任务池变更只在挑战日边界部署。违反时，跨天迟到局的候选重算会失配，该局被丢弃（不会发错奖，只会漏发）。

### 6.2 全部派生、不落库的值

`totalRounds`（常量 3）、`currentRound` = `todayCompleted.length + 1`、`completedRoundCount` = `todayCompleted.length`、`needsSelection` = `todayCompleted.length < 3`、`startsAt` / `endsAt`（从 `dayId` 算）、`candidates`、每个候选的 `star` / `target` / `rewardSeasonPoint` / `unit`。

### 6.3 与现状对比

| | 现状 | Phase1 |
| --- | --- | --- |
| 每日挑战自有 collection 数 | 7 | 1 |
| 每日挑战独立接口 | 5 | 0 |
| `/game/start` 10 人读次数 | 40+ | 10 |
| `/game/end` 每人事务 | 跨 3 个 collection，3 读 2 写 | 跨 2 个文档，2 读 2 写 |
| 版本号 | 4 套 | 0 |
| 客户端采集代码 | ~1700 行（含测试） | 0 |

## 7. API 契约

Phase1 **没有任何独立接口**，全部寄生在 `/game/start` 和 `/game/end` 上。

### 7.1 `GET /game/start`

响应新增（沿用现有 `dailyChallenges` 数组字段名，结构简化）：

```json
{
  "dailyChallenges": [
    {
      "steamId": 483215844,
      "dayId": "2026-08-10",
      "totalRounds": 3,
      "currentRound": 2,
      "candidates": [
        {
          "taskId": "general_hero_damage_2",
          "scope": "personal_general",
          "metric": "hero_damage",
          "star": 2,
          "target": 500000,
          "rewardSeasonPoint": 80
        },
        {
          "taskId": "general_healing_1",
          "scope": "personal_general",
          "metric": "healing",
          "star": 1,
          "target": 225000,
          "rewardSeasonPoint": 60
        },
        {
          "taskId": "hero_lina_1",
          "scope": "personal_hero",
          "metric": "hero_damage",
          "heroName": "npc_dota_hero_lina",
          "star": 3,
          "target": 900000,
          "rewardSeasonPoint": 100
        }
      ],
      "todayCompleted": [
        { "taskId": "general_kills_1", "star": 1, "seasonPoint": 60 }
      ],
      "history": [
        { "dayId": "2026-08-09", "rounds": 3, "seasonPoint": 240 }
      ]
    }
  ]
}
```

三轮全部完成时 `candidates` 为空数组。没有 `schemaVersion`、没有 `unit`（由 `metric` 在客户端映射）、没有 `assignmentId`、没有 `progress`。`todayCompleted` 里的 `matchId` 只用于服务端排查，不下发给客户端。

`dayId` 由客户端保存，`/game/end` 时原样回传。

每日挑战异常只记 `logger.warn`，不阻断开局响应——沿用现有做法。

### 7.2 `POST /game/end`

请求：`GameEndPlayerDto` 新增一个可选字段，`GameEndDto` 顶层新增一个可选字段。

```ts
export class GameEndPlayerDto {
  // ... 现有字段不变
  /** 本局玩家选择的每日挑战任务；未选择时不发送 */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dailyChallengeTaskId?: string;
}

export class GameEndDto extends EventBaseDto {
  // ... 现有字段不变
  /** 本局归属的挑战日，取自 /game/start 响应 */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dailyChallengeDayId?: string;
}
```

现有的 `DailyChallengeMatchContributionDto`（66 行，含 `schemaVersion` / `dataVersion` / `personalMetrics` / `globalMetrics`）整个删除——指标值直接从同一个 `players[i]` 对象里读。

响应新增：

```json
{
  "result": "OK",
  "dailyChallengeRewards": [
    { "steamId": 483215844, "taskId": "general_kills_1", "seasonPoint": 60 }
  ]
}
```

不返回快照。玩家下次开局才看到新一轮候选。

## 8. 服务端逻辑

### 8.1 候选生成

```ts
generateCandidates(dayId: string, steamId: number, round: number): Candidate[]
```

seed = `${dayId}:${steamId}:${round}`，FNV-1a 哈希取模，从排序后的任务池中抽取：

1. 抽 1 个通用任务
2. 抽第 2 个通用任务，排除第 1 个的 `metric`（保证同轮两个通用任务指标不同）
3. 抽 1 个英雄任务
4. 每个候选独立掷星级，权重 1:1:1

现有 `getMetricCategory()` 的伤害族 / 控制族归并可以删除——Phase1 的 7 个指标各自独立，直接比较 `metric` 即可。

同一天不同轮之间不做去重（`seenTaskIds` 删除）：round 进 seed 已经让不同轮抽到不同结果，而 19 个通用任务里连抽 3 轮撞车的概率可以接受。

### 8.2 `/game/start` 流程

对每个 steamId：

```
读文档（不存在 → 视为新玩家，dayId = ''）
if (文档.dayId !== today):
    if (文档.todayCompleted 非空):
        history.unshift({ dayId: 文档.dayId, rounds, seasonPoint 汇总 })
        history 裁到 30 条
    dayId = today
    todayCompleted = []
    processedMatchIds = []
    写回
返回快照（candidates 现算）
```

当天没有任何完成记录时不写 history 条目——`history` 只记录有完成的天。Phase2 数连续天数时靠 `dayId` 连续性判断，不依赖空条目占位。

新玩家在第一次 `/game/start` 时懒创建，不需要任何初始化数据投放。

### 8.3 `/game/end` 流程

对每个满足条件的玩家（`steamId > 0`、`!isDisconnected`、`dailyChallengeTaskId` 非空、`dailyChallengeDayId` 非空）跑一个事务：

```
读文档
if (matchId ∈ processedMatchIds): 返回已有结果      // 幂等
确定目标日期桶：
    if (dailyChallengeDayId === 文档.dayId):        → 当天，写 todayCompleted
    else if (dailyChallengeDayId === history[0]?.dayId): → 回写 history[0]
    else: 丢弃并 logger.warn                        // 太旧或不匹配
round = 该桶已完成轮数 + 1
if (round > 3): 丢弃
candidates = generateCandidates(dailyChallengeDayId, steamId, round)
task = candidates.find(c => c.taskId === dailyChallengeTaskId)
if (!task): 丢弃并 logger.warn                      // 任务池变更或客户端伪造
if (task.scope === PERSONAL_HERO && task.heroName !== player.heroName): 丢弃
value = player[METRIC_FIELD[task.metric]]
if (value < task.target): 只记 processedMatchIds，不发奖
else:
    发放 task.rewardSeasonPoint 赛季积分
    写入对应桶（todayCompleted.push 或 history[0].rounds/seasonPoint 累加）
processedMatchIds.push(matchId)，裁到最近 10 个
写回
```

**每个玩家独立事务，独立 try/catch。** 现有实现里任何一个玩家抛异常会中断整局结算并留下半写状态，Phase1 必须逐人隔离：一个玩家失败只影响他自己，其余玩家照常结算。

赛季积分入账沿用现有路径：`Players/{steamId}.seasonPointTotal += rewardSeasonPoint`，与 `player_daily_challenges/{steamId}` 的写入放在**同一个事务**里，两个文档原子提交。幂等由 `processedMatchIds` 保证，因此不再需要 `daily_challenge_reward_ledger` 这一层。

事务涉及 2 个文档（对比现状的 3 读 2 写跨 3 个 collection）。

## 9. 错误处理

| 情况 | 行为 |
| --- | --- |
| `/game/start` 每日挑战失败 | `logger.warn`，响应里省略 `dailyChallenges`，不阻断开局 |
| `/game/end` 单个玩家失败 | `logger.warn`，跳过该玩家，其余玩家继续 |
| `dailyChallengeTaskId` 不在重算出的候选里 | 丢弃 + `logger.warn`（可能是任务池被中途改动，或客户端异常） |
| 英雄不匹配 | 静默丢弃，不计入 |
| `dailyChallengeDayId` 既非当天也非 `history[0]` | 丢弃 + `logger.warn` |
| 同一 matchId 重放 | 幂等返回，不重复发奖 |

没有任何情况会 `throw` 到 `/game/end` 之外——现有 `advanceCompletedRound()` 里那个 `config version mismatch` 的 `throw` 随 `configVersion` 一起消失。

## 10. 模块结构

```
api/src/daily-challenge/
├── config/
│   ├── tasks.ts                    # 任务池 + 数值配置
│   └── tasks.spec.ts               # 配置守卫测试（沿用现有 18 条，按新结构调整）
├── entities/
│   └── player-daily-challenge.entity.ts
├── dto/
│   ├── daily-challenge-snapshot.dto.ts
│   └── daily-challenge-reward.dto.ts
├── services/
│   ├── daily-challenge-generation.service.ts   # 确定性候选生成
│   ├── daily-challenge.service.ts              # 开局快照 + 结算
│   └── daily-challenge.store.ts                # Firestore 读写
├── types/
│   └── daily-challenge.types.ts                # enum + metric → GameEnd 字段映射
└── daily-challenge.module.ts
```

`ChallengeDayClockService` 保留在 `api/src/util/`（现有位置），去掉 `closesAt` 和 120 分钟宽限——那是共同任务封口用的。

现有 11599 行（含 2837 行任务池和全部测试）预计降到约 400 行实现 + 任务池 + 测试。

## 11. 测试策略

**Unit**

- 生成器：同一 `(dayId, steamId, round)` 结果稳定；不同 round 结果不同；固定 2 通用 + 1 英雄；同轮两个通用任务 metric 不同；星级落在 1~3
- 跨天重置：`dayId` 变化时汇总进 history、裁到 30 条、`todayCompleted` 清空
- 达标判定：`value >= target` 才发奖；英雄不匹配不计；掉线不计
- 幂等：同一 matchId 重放不重复发奖、不重复写 history
- 跨天迟到：`dayId === history[0].dayId` 时正确回写
- 星级目标：`Math.round(target * multiplier)`，1★/2★/3★ 递增
- 配置守卫：任务池 id 唯一、英雄任务必带 `heroName`、通用任务不带、`metric` 在 Phase1 白名单内、`target` 为正整数

**E2E**（`api/test/daily-challenge.e2e-spec.ts`）

- 完整一天：开局 → 完成第 1 轮 → 再开局拿到第 2 轮候选 → 完成 → 第 3 轮 → 三轮完成后 `candidates` 为空
- 跨天：第 1 天完成 2 轮 → 第 2 天开局，history 出现第 1 天的条目、`todayCompleted` 清空
- 跨天迟到局：第 2 天已开局后，上报 `dailyChallengeDayId = 第 1 天` 的 `/game/end`，正确回写 `history[0]`
- `/game/end` 重试：同一 matchId 调两次，赛季积分只加一次
- 一个玩家数据异常不影响同局其他玩家结算

各用例使用独立 steamId（遵循仓库 e2e 规范）。

## 12. 需要在实施前定的事

以下四项写死了默认值，但需要确认：

1. **任务池数值全部要重标。** 现有 404 条的 `target` 是按跨局累积标的（如 `general_hero_damage: 500000`）。改成单局达标后必须按"单局可达"重新标定，建议用 BigQuery 里的历史对局数据取分位数（例如 2★ 目标 = 该指标的 P50，1★ = P30，3★ = P75）。**这是 Phase1 的前置工作，不是实施细节。**

2. **通用任务数量。** 现有 19 条对应 19 个 metric。Phase1 只剩 7 个 metric，需要重新设计通用任务——建议同一 metric 配多个难度档，比如 `general_hero_damage_low/mid/high`，凑到 15~20 条以保证三轮不重复。

3. **英雄专属任务的区分度。** 381 条（127 英雄 × 3）在只有 7 个 metric 时，区分只靠 `heroName` + 数值。默认保持 127 × 3 的规模，但可以考虑降到 127 × 1（每个英雄一条，用 `heroName` 匹配本局英雄后从中抽）以大幅缩小任务池文件。

4. **每天轮数** 默认保持 3。

## 13. 客户端需要同步的改动（game 仓库）

按本设计，game PR #2310 需要撤掉的部分：

- `src/vscripts/modules/daily-challenge/` 下的 6 个采集模块（accumulator、contribution-collector、damage-observer、modifier-classifier、metric-snapshot、telemetry）——Phase1 不需要任何采集
- `daily-challenge-match-context.ts` 的挑战日顺序保护、`confirmMatchStart()`
- `shouldReplaceDailyChallengeSnapshot()` 及 VScript store / Panorama client 两层防回退
- `daily-challenge-snapshot.ts` 的独立接口调用（accept / refresh / view / snapshot）
- `DailyChallengeSnapshotVersion` 类型与全部版本兼容分支

保留并调整：

- Panorama UI 全套（页面、候选卡、星级徽章、历史面板、结算页积分）
- 三语本地化资源——文案 key 按 `scope` + `metric` 拼，Phase1 只需要 7 个 metric 的模板
- `game-end.ts`：在 `players[i]` 上多发 `dailyChallengeTaskId`，顶层多发 `dailyChallengeDayId`

## 14. 现有实现（PR #1040 / #2310）的去留

现有后端 11599 行按去留分类：

### 14.1 跨阶段复用（约 3300 行，其中 2837 是任务池数据）

| 文件 | 行数 | 处置 |
| --- | --- | --- |
| `config/tasks.ts` | 2837 | **保留结构与 127 英雄清单**。数值按第 12 节重标，`metric` 收敛到 7 个 |
| `config/tasks.spec.ts` | 234 | 保留大部分守卫（id 唯一、英雄任务必带 `heroName`、`target` 正整数、星级递增），删掉 404/19/381 数量断言和 `dataVersion` 断言 |
| `services/daily-challenge-generation.service.ts` | 134 | **核心算法直接复用**（FNV-1a、seeded pick、`pickStar`）。删掉 `getMetricCategory()` 的伤害族/控制族归并和 `seenTaskIds` 回退后约 90 行 |
| `services/daily-challenge-generation.service.spec.ts` | 183 | 同上，按新签名调整 |
| `services/daily-challenge-personal-config.ts` + spec | 136 | 保留星级目标解析，删掉毫秒取整分支 |
| `util/challenge-day-clock.service.ts` | — | 保留，删掉 `closesAt` 和 120 分钟宽限（那是共同任务封口用的） |

**game 仓库的 Panorama UI 是最大的可保留资产**：761 行 `styles.less` + 8 个组件 + 三语本地化资源，Phase1 基本不动，只需按新快照结构调整字段名。

### 14.2 Phase2（连续完成）：代码不保留，产品规则保留

`daily-challenge-streak.service.ts`（49 行）+ spec（93 行）作废。

`settle()` 的 `previousDays + 1` 和 `streakCycleId` 归属判定，存在的唯一原因是"streak 状态存在每天的文档里，必须跨天读上一天"。新模型下连续天数直接数 `history` 里连续的 `dayId`，这套逻辑失去意义。

**保留的是产品规则**：里程碑 3/7/14/30 天 → 50/120/300/800 赛季积分，到最高里程碑后清零重新循环。

### 14.3 Phase3（全服共同任务）：算法思路保留，代码不保留

约 2000 行作废：`global-freeze.service/store`、`global-ranking.service`、`global-progress.store`、`settlement.service/store`、`day.service/store/entity`、`global-contribution/ranking` 两个 entity，及其全部 spec。

原因是数据模型变了——新设计没有 `daily_challenge_days`、没有挑战日状态机，这些代码全部建立在那两样东西之上。

**值得在 Phase3 照着重写的两个算法**：

1. `global-freeze.store` 的分页流式扫描（500 条一批），避免一次性读取全服贡献
2. `global-ranking.service` 的 cursor 分档：一次遍历算出 top 10% / next 30% / rest，不需要对全量排序

**Phase3 开工前应重新评估共同任务的形态**。如果改成"全服达标 → 所有有效贡献者拿固定积分"，就不需要排名、不需要 `rankings` collection、不需要冻结时刻，只要一个 `daily_challenge_global/{dayId}` 文档累加 + 一个达标标志——上面两个算法里只剩分页扫描还用得上。排名玩法的价值（80/90/100 三档，最高档比保底多 25%，且玩家局内看不到自己排第几）与它引入的复杂度是否匹配，需要单独决策。

### 14.4 因架构改变而作废（约 6000 行）

`progress.service`（452 + 1103 spec）、`player.service`（381 + 544）、`player.store`（377 + 202）、`progress.store`（194 + 408）、`reward.service/store`（126 + 155 + 426 spec）、`reward-notification`（79 + 150）、`refresh.service`（144）、controllers（88）、全部 dto（约 330）、`match/reward/operation` 三个 ledger entity（73）、`types`（179）、module（71）、协议类 spec（267）。

### 14.5 PR 处理建议

**不要在 PR #1040 上改**，另开 Phase1 PR 从 `develop` 切：

- 保留比例约 30%，其中大头还是任务池数据，实际等于重写
- #1040 在贡献者的 fork 分支上，在别人分支上做这种规模的重写不合适
- #1040 保持可读状态，Phase2/3 开工时还能回来查 14.2 / 14.3 里那些算法

game PR #2310 同理：另开分支，从中挑出 Panorama UI 与三语资源。
