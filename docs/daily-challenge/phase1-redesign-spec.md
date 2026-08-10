# 每日挑战 Phase1 重新设计

日期：2026-08-11
状态：待评审
替代：PR #1040（firebase）+ PR #2310（game）的后端设计

## 1. 背景

现有实现把四个玩法（个人任务、全服共同任务、连续完成、付费刷新）一次性做完，代价是：

- 7 个 Firestore collection，开局 10 人需要 40+ 次读
- 5 状态挑战日状态机（`OPEN → CLOSING → FROZEN → REWARDING → SETTLED`），寄生在 `/game/start` 上补结算
- 4 个互相无序的快照推送来源，逼出客户端三层防回退逻辑
- 4 套版本号（`schemaVersion` / `dataVersion` / `configVersion` / 客户端镜像），其中 `configVersion` 在三处语义不一致
- 服务端用客户端上报的数字重算一遍客户端已经算过的达标判定

本设计把范围收敛到个人任务，并做两件事：用**确定性重算**替代落库冻结，用**客户端判定 + 客户端计分**替代服务端重复判定。

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

- 候选在 `/game/start` 时由服务端生成并随响应下发，**带 `target` 和 `rewardSeasonPoint`**
- 玩家在客户端本地选择，**不产生任何 API 调用**
- 客户端局内累计指标、判定达标、结算时把奖励计入本局赛季积分
- `/game/end` 上报"我完成的是哪个 taskId"，服务端记一轮完成
- 完成一轮后，下一轮候选在**下一次** `/game/start` 生成；同一局内不推进第二轮
- 未完成时候选不变，玩家下一局可以改选同一组里的另一个

### 3.2 进度模型

**单局达标才算完成，不跨局累积。**

这不只是简化——判定在客户端做，而 Panorama / vscripts 无法跨局持久化进度，所以跨局累积在这个架构下不可实现。目标值必须按"单局可达"标定。

不存在"接取"概念，服务端不存 `progress`。

### 3.3 星级

每个候选独立掷一个星级，决定目标与奖励：

| 星级 | 目标倍率 | 赛季积分 |
| --- | --- | --- |
| 1★ | 0.75 | 60 |
| 2★ | 1.0 | 80 |
| 3★ | 1.5 | 100 |

单日个人赛季积分上限 300（三轮全 3★）。

星级由 seed 确定性掷出，权重 1:1:1。毫秒类指标的目标取整到整千，其余四舍五入到整数：

```ts
const scaled = task.target * multipliers[star];
return unit === MILLISECOND && scaled >= 1000
  ? Math.max(1, Math.round(scaled / 1000) * 1000)
  : Math.max(1, Math.round(scaled));
```

### 3.4 英雄专属任务

每轮 3 个候选中固定 1 个是英雄专属。客户端在判定时检查本局英雄是否匹配 `heroName`，不匹配则该任务不可完成（UI 上应直接标记为"需要 XXX"）。

### 3.5 已删除的机制

| 机制 | 处置 |
| --- | --- |
| 付费刷新 | 删除。连带 `daily_challenge_operation_ledger` 和 `requestId` 幂等机制一起消失——刷新是唯一"重复执行会扣钱"的操作 |
| 10 分钟接取窗口 | 删除。作弊面被限制在"3 个固定候选里挑最有利的一个"，这本就是三选一的设计意图 |
| 连续完成 | 移到 Phase2 |
| 全服共同任务 | 移到 Phase3。连带挑战日状态机、`daily_challenge_days` / `global_contributions` / `global_rankings` 三个 collection、`reconcile()` 补结算全部消失 |
| 未读红点 / 奖励历史面板 | 删除 `POST /view`。历史改为 `history` 数组，随开局快照下发 |
| 服务端达标判定 | 移到客户端。服务端不再需要指标数值、单局上限表、metric→字段映射 |

## 4. 责任划分

前提：`/game/end` 经 `x-api-key` 校验，数据可信。现有 `battlePoints`（即赛季积分）本来就是客户端算、服务端直接累加，每日挑战积分走同一条路。

### 4.1 客户端（game 仓库）

- **指标采集**：`src/vscripts/modules/daily-challenge/` 全部保留——19 个指标的采集、归属判定、modifier 分类
- **达标判定**：用服务端下发的 `metric` / `target` / `heroName` 在局内判定
- **计分**：达标后把 `rewardSeasonPoint` 计入本局 `battlePoints`
- **全部文案**：`addon_schinese/english/russian.txt`，按 `scope` + `metric` 拼本地化 key，替换 `{hero}` / `{target}`。英雄名走 DOTA 自带的 `#npc_dota_hero_*`。`unit`（次数/伤害/秒）由 `metric` 在客户端映射
- **候选选择**：本地状态，零网络请求
- **UI**：HUD 入口、挑战面板、候选卡、星级徽章、今日记录、历史列表、结算页积分

### 4.2 API

职责收缩为两件事：

- **候选生成**：确定性抽取 + 星级掷点，下发 `taskId` / `scope` / `metric` / `heroName` / `star` / `target` / `rewardSeasonPoint`
- **轮次记录**：`/game/end` 上报 `taskId` 后记一轮完成，推进轮次、跨天重置、维护 history

**服务端不再需要**：`ChallengeMetric` → `GameEndPlayerDto` 字段映射、`DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION`、`DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION`、`DAILY_CHALLENGE_METRIC_UNIT`、达标判定逻辑、赛季积分发放路径。

**候选生成必须留在服务端**——否则玩家可以自己宣称抽到了三个最容易的任务。这是唯一不可下放的部分。`target` 和 `rewardSeasonPoint` 由服务端随候选下发，客户端只是执行服务端定的规则，**任务池仍然是单一来源**，不存在两端各维护一份的漂移风险。

## 5. 指标范围

**19 个指标全部保留**：`hero_damage`、`physical/magical/pure_damage`、`damage_taken`、`healing`、`kills`、`assists`、`last_hits`、`tower_kills`、`bot_kills`、`roshan_kills`，以及 7 个控制时长（`stun` / `slow` / `root` / `silence` / `taunt` / `break` / `debuff`）。

服务端不看数值，所以指标多少对服务端没有成本。`ChallengeMetric` enum 保留（候选要下发 metric 给客户端），其余三张 metric 映射表全部删除。

**运维约定（替代 `dataVersion`）**：新增 metric 的任务，必须在客户端发布**之后**才上线到任务池。DOTA2 自定义游戏进服强制更新，客户端版本分裂窗口很短。若违反，老客户端拿到无法采集的 metric 时应在 UI 上禁用该候选而非静默失败。

## 6. 数据模型

每日挑战**只新增一个 collection**。赛季积分仍写入既有的 `Players` collection，且不新增写入点（见 7.2）。

```ts
// api/src/daily-challenge/entities/player-daily-challenge.entity.ts
@Collection('player_daily_challenges')
export class PlayerDailyChallenge {
  id: string;                 // = steamId.toString()
  steamId: number;
  dayId: string;              // 'YYYY-MM-DD'，读到时若 !== 今天则触发跨天重置

  completedTaskIds: string[]; // 今天已完成的 taskId，长度 0~3
  todaySeasonPoint: number;   // 今日累计，跨天时汇总进 history
  history: DailyChallengeHistoryEntry[];  // 最近 30 天，最新在前

  updatedAt: Date;
}

export interface DailyChallengeHistoryEntry {
  dayId: string;
  rounds: number;       // 当天完成轮数
  seasonPoint: number;  // 当天获得赛季积分
}
```

五个业务字段。文档数固定等于玩家数，永不增长。

### 6.1 幂等是免费的

不需要 `processedMatchIds`：**taskId 天然幂等**。同一个 taskId 不会在两轮里出现（`round` 进 seed），重复上报时它已经在 `completedTaskIds` 里，直接忽略。

而赛季积分不在服务端加，所以 `/game/end` 重放也不会重复发分——重放会重复累加 `battlePoints`，但那是既有缺陷（见 9.2），不是本设计引入的。

### 6.2 候选不落库

候选由 `(dayId, steamId, round)` 确定性生成——taskId、星级、目标、奖励全部可重算。因此不存 `candidates`、不存 `star`、不存 `target`。

跨天迟到的 `/game/end` 也靠重算验证：上报 `dayId=昨天` 时，用昨天的 dayId 重新生成候选来验证 `taskId`，不需要保留任何昨天的快照。

**运维约束（替代 `configVersion`）**：已上线任务的 `id` 与 `metric` 不得修改；任务池变更只在挑战日边界部署。违反时，跨天迟到局的候选重算会失配，该局的轮次不被记录（玩家的积分已由客户端加过，不会丢分，只会丢一次轮次计数）。

### 6.3 全部派生、不落库的值

`totalRounds`（常量 3）、`currentRound` = `completedTaskIds.length + 1`、`completedRoundCount` = `completedTaskIds.length`、`needsSelection` = `completedTaskIds.length < 3`、`startsAt` / `endsAt`（从 `dayId` 算）、`candidates` 及其 `star` / `target` / `rewardSeasonPoint`。

### 6.4 与现状对比

| | 现状 | Phase1 |
| --- | --- | --- |
| 每日挑战自有 collection | 7 | 1 |
| 每日挑战独立接口 | 5 | 0 |
| `/game/start` 10 人读次数 | 40+ | 10 |
| `/game/end` 每人事务 | 跨 3 个 collection，3 读 2 写 | 单文档，1 读 1 写 |
| 赛季积分写入点 | 新增一条（reward store 事务） | 0（并入现有 `upsertGameEnd`） |
| 版本号 | 4 套 | 0 |

## 7. API 契约

Phase1 **没有任何独立接口**，全部寄生在 `/game/start` 和 `/game/end` 上。

### 7.1 `GET /game/start`

响应新增（沿用现有 `dailyChallenges` 数组字段名，结构简化）：

```json
{
  "dailyChallenges": [
    {
      "steamId": 483215844,
      "dayId": "2026-08-11",
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
          "taskId": "general_stun_1",
          "scope": "personal_general",
          "metric": "stun_duration_ms",
          "star": 1,
          "target": 45000,
          "rewardSeasonPoint": 60
        },
        {
          "taskId": "hero_lina_1",
          "scope": "personal_hero",
          "metric": "magical_damage",
          "heroName": "npc_dota_hero_lina",
          "star": 3,
          "target": 900000,
          "rewardSeasonPoint": 100
        }
      ],
      "completedTaskIds": ["general_kills_1"],
      "todaySeasonPoint": 60,
      "history": [
        { "dayId": "2026-08-10", "rounds": 3, "seasonPoint": 240 }
      ]
    }
  ]
}
```

三轮全部完成时 `candidates` 为空数组。没有 `schemaVersion`、没有 `unit`、没有 `assignmentId`、没有 `progress`。

`dayId` 由客户端保存，`/game/end` 时原样回传。

每日挑战异常只记 `logger.warn`，不阻断开局响应——沿用现有做法。

### 7.2 `POST /game/end`

请求：`GameEndPlayerDto` 新增一个可选字段，`GameEndDto` 顶层新增一个可选字段。挑战积分由客户端**直接计入 `battlePoints`**，不单独传。

```ts
export class GameEndPlayerDto {
  // ... 现有字段不变，battlePoints 已含每日挑战奖励
  /** 本局完成的每日挑战任务；未完成时不发送 */
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

现有的 `DailyChallengeMatchContributionDto`（66 行，含 `schemaVersion` / `dataVersion` / `personalMetrics` / `globalMetrics`）整个删除。

响应不新增字段——客户端自己知道加了多少分，服务端无需回传奖励或快照。玩家下次开局才看到新一轮候选。

### 7.3 `battlePoints` 上限行为变更

```ts
// 现状 game.controller.ts:234 —— 超限丢弃该玩家整个结算
private isEligibleForBaseSettlement(steamId: number, battlePoints: number): boolean {
  return steamId > 0 && battlePoints >= 0 && battlePoints <= 500;
}
```

3★ 任务 +100 会顶破 500，而超限的后果不是截断，是**该玩家的 `battlePoints`、`matchCount`、`winCount` 全部不写**。必须改为 cap：

```ts
const MAX_BATTLE_POINTS_PER_MATCH = 500;

// 超限仍记 warn 保留异常信号，但截断而非丢弃
if (battlePoints > MAX_BATTLE_POINTS_PER_MATCH) {
  logger.warn('game/end: battlePoints exceeds cap, truncating', { steamId, serverType, battlePoints });
}
const settledPoints = Math.min(MAX_BATTLE_POINTS_PER_MATCH, Math.max(0, battlePoints));
```

上限值保持 500 不变。

**已知代价**：基础对局积分接近上限的玩家会吃掉部分挑战积分（基础 450 + 挑战 100 → 只拿 500，损失 50）。实施前应用 BigQuery 查 `battlePoints` 的真实分布确认影响面；若 P95 已接近 500 则需要重新讨论上限。

## 8. 服务端逻辑

### 8.1 候选生成

```ts
generateCandidates(dayId: string, steamId: number, round: number): Candidate[]
```

seed = `${dayId}:${steamId}:${round}`，FNV-1a 哈希取模，从排序后的任务池中抽取：

1. 抽 1 个通用任务
2. 抽第 2 个通用任务，排除与第 1 个同类的 metric（沿用现有 `getMetricCategory()` 的伤害族 / 控制族归并，避免同轮出现两个控制时长任务）
3. 抽 1 个英雄任务
4. 每个候选独立掷星级，权重 1:1:1

同一天不同轮之间不做去重（`seenTaskIds` 删除）：`round` 进 seed 已经让不同轮抽到不同结果。

### 8.2 `/game/start` 流程

对每个 steamId：

```
读文档（不存在 → 视为新玩家，dayId = ''）
if (文档.dayId !== today):
    if (completedTaskIds 非空):
        history.unshift({ dayId: 文档.dayId, rounds: completedTaskIds.length, seasonPoint: todaySeasonPoint })
        history 裁到 30 条
    dayId = today
    completedTaskIds = []
    todaySeasonPoint = 0
    写回
返回快照（candidates 现算）
```

当天没有任何完成记录时不写 history 条目——`history` 只记录有完成的天。Phase2 数连续天数时靠 `dayId` 连续性判断，不依赖空条目占位。

新玩家在第一次 `/game/start` 时懒创建，不需要任何初始化数据投放。

### 8.3 `/game/end` 流程

对每个满足条件的玩家（`steamId > 0`、`!isDisconnected`、`dailyChallengeTaskId` 非空、`dailyChallengeDayId` 非空）跑一个事务：

```
读文档
确定目标日期桶：
    if (dailyChallengeDayId === 文档.dayId):              → 当天
    else if (dailyChallengeDayId === history[0]?.dayId):  → 回写 history[0]
    else: 丢弃并 logger.warn                              // 太旧或不匹配
if (taskId 已在该桶的已完成记录里): 直接返回              // 幂等
round = 该桶已完成轮数 + 1
if (round > 3): 丢弃并 logger.warn
candidates = generateCandidates(dailyChallengeDayId, steamId, round)
task = candidates.find(c => c.taskId === dailyChallengeTaskId)
if (!task): 丢弃并 logger.warn                            // 任务池变更或客户端异常
写入对应桶：
    当天    → completedTaskIds.push(taskId); todaySeasonPoint += task.rewardSeasonPoint
    history → history[0].rounds += 1; history[0].seasonPoint += task.rewardSeasonPoint
写回
```

服务端不验证指标数值，不发放积分——积分已由客户端计入 `battlePoints`，在同一个 `/game/end` 请求里通过既有的 `upsertGameEnd()` 入账。

`history[0]` 的幂等判定用 `rounds` 计数无法区分具体 taskId，因此跨天回写路径下重复上报会重复计数。这是可接受的：跨天迟到本身罕见，且只影响 history 的统计数字，不影响积分。

**每个玩家独立事务，独立 try/catch。** 现有实现里任何一个玩家抛异常会中断整局结算并留下半写状态，Phase1 必须逐人隔离。

## 9. 错误处理

### 9.1 失败路径

| 情况 | 行为 |
| --- | --- |
| `/game/start` 每日挑战失败 | `logger.warn`，响应里省略 `dailyChallenges`，不阻断开局 |
| `/game/end` 单个玩家失败 | `logger.warn`，跳过该玩家，其余玩家继续 |
| `dailyChallengeTaskId` 不在重算出的候选里 | 丢弃 + `logger.warn`（任务池被中途改动，或客户端异常） |
| `dailyChallengeDayId` 既非当天也非 `history[0]` | 丢弃 + `logger.warn` |
| 同一 taskId 重复上报 | 幂等忽略 |
| `battlePoints` 超过 500 | cap 到 500 + `logger.warn` |

没有任何情况会 `throw` 到 `/game/end` 之外。

### 9.2 继承的既有缺陷

`/game/end` 本身没有幂等保护：重试会重复累加 `seasonPointTotal`、重复 `matchCount++`。每日挑战积分并入 `battlePoints` 后金额变大，但性质不变。

**本 spec 不修这个**，因为它属于基础结算而非每日挑战。若要修，方向是在 `Players` 上记 `lastSettledMatchId`，属于独立决策。

## 10. 模块结构

```
api/src/daily-challenge/
├── config/
│   ├── tasks.ts                                # 任务池 + 数值配置
│   └── tasks.spec.ts                           # 配置守卫测试
├── entities/
│   └── player-daily-challenge.entity.ts
├── dto/
│   └── daily-challenge-snapshot.dto.ts
├── services/
│   ├── daily-challenge-generation.service.ts   # 确定性候选生成
│   ├── daily-challenge.service.ts              # 开局快照 + 轮次记录
│   └── daily-challenge.store.ts                # Firestore 读写
├── types/
│   └── daily-challenge.types.ts                # ChallengeScope / ChallengeMetric enum
└── daily-challenge.module.ts
```

`ChallengeDayClockService` 保留在 `api/src/util/`（现有位置），去掉 `closesAt` 和 120 分钟宽限——那是共同任务封口用的。

现有 11599 行（含 2837 行任务池和全部测试）预计降到约 350 行实现 + 任务池 + 测试。

## 11. 测试策略

**Unit**

- 生成器：同一 `(dayId, steamId, round)` 结果稳定；不同 round 结果不同；固定 2 通用 + 1 英雄；同轮两个通用任务不同类；星级落在 1~3
- 星级目标：`Math.round(target * multiplier)`，毫秒类取整到整千，1★/2★/3★ 递增
- 跨天重置：`dayId` 变化时汇总进 history、裁到 30 条、`completedTaskIds` 与 `todaySeasonPoint` 清空；当天无完成时不写 history 条目
- 轮次记录：taskId 在候选里才记；`round > 3` 丢弃；掉线玩家跳过
- 幂等：同一 taskId 重复上报不重复计数、不重复加 `todaySeasonPoint`
- 跨天迟到：`dayId === history[0].dayId` 时正确回写
- `battlePoints` cap：超限截断到 500 且不丢弃该玩家结算
- 配置守卫：任务池 id 唯一、英雄任务必带 `heroName`、通用任务不带、`target` 为正整数、`metric` 在 enum 内

**E2E**（`api/test/daily-challenge.e2e-spec.ts`）

- 完整一天：开局 → 上报完成第 1 轮 → 再开局拿到第 2 轮候选 → 完成 → 第 3 轮 → 三轮完成后 `candidates` 为空
- 跨天：第 1 天完成 2 轮 → 第 2 天开局，history 出现第 1 天条目、当日字段清空
- 跨天迟到局：第 2 天已开局后，上报 `dailyChallengeDayId = 第 1 天` 的 `/game/end`，正确回写 `history[0]`
- `/game/end` 重试：同一 taskId 调两次，`completedTaskIds` 不重复
- 一个玩家数据异常不影响同局其他玩家结算
- `battlePoints = 580` 时玩家仍完成基础结算，`seasonPointTotal` 只 +500

各用例使用独立 steamId（遵循仓库 e2e 规范）。

## 12. 需要在实施前定的事

1. **任务池数值全部要重标。** 现有 404 条的 `target` 是按跨局累积标的（如 `general_hero_damage: 500000`）。改成单局达标后必须按"单局可达"重新标定，建议用 BigQuery 里的历史对局数据取分位数（例如 2★ 目标 = 该指标的 P50，1★ = P30，3★ = P75）。**这是 Phase1 的前置工作，不是实施细节。**

2. **`battlePoints` 分布确认。** 用 BigQuery 查现有 `battlePoints` 的分位数，确认 cap 到 500 会影响多少比例的对局。若 P95 已接近 500，需要重新讨论上限值。

3. **英雄专属任务规模。** 默认保持 127 英雄 × 3 = 381 条。可以考虑降到 127 × 1（每个英雄一条，抽到时按本局英雄匹配）以大幅缩小任务池文件。

4. **每天轮数** 默认保持 3。

## 13. 客户端需要同步的改动（game 仓库）

### 13.1 保留

- `src/vscripts/modules/daily-challenge/` **全部 6 个采集模块**（accumulator、contribution-collector、damage-observer、modifier-classifier、metric-snapshot、telemetry）——判定移到客户端后，这些是核心而非可选
- Panorama UI 全套（页面、候选卡、星级徽章、历史面板、结算页积分）
- 三语本地化资源，含 19 个 metric 的模板

### 13.2 新增

- **达标判定**：用服务端下发的 `metric` / `target` / `heroName` 在局内判定，英雄不匹配的候选在 UI 上禁用
- **计分**：达标后把 `rewardSeasonPoint` 计入本局 `battlePoints`
- `game-end.ts`：`players[i]` 多发 `dailyChallengeTaskId`，顶层多发 `dailyChallengeDayId`

### 13.3 删除

- `daily-challenge-match-context.ts` 的挑战日顺序保护、`confirmMatchStart()`
- `shouldReplaceDailyChallengeSnapshot()` 及 VScript store / Panorama client 两层防回退
- `daily-challenge-snapshot.ts` 的独立接口调用（accept / refresh / view / snapshot）
- `DailyChallengeSnapshotVersion` 类型与全部版本兼容分支
- `contribution-collector` 里向服务端上报 `personalMetrics` / `globalMetrics` 的部分（采集逻辑保留，上报改为只发 taskId）

## 14. 现有实现（PR #1040 / #2310）的去留

### 14.1 跨阶段复用（约 3300 行，其中 2837 是任务池数据）

| 文件 | 行数 | 处置 |
| --- | --- | --- |
| `config/tasks.ts` | 2837 | **保留结构与 127 英雄清单**。数值按第 12 节重标，19 个 metric 全部保留 |
| `config/tasks.spec.ts` | 234 | 保留大部分守卫，删掉 `dataVersion` 断言和共同任务相关断言 |
| `services/daily-challenge-generation.service.ts` | 134 | **核心算法直接复用**（FNV-1a、seeded pick、`pickStar`、`getMetricCategory`）。删掉 `seenTaskIds` 回退后约 110 行 |
| `services/daily-challenge-generation.service.spec.ts` | 183 | 同上，按新签名调整 |
| `services/daily-challenge-personal-config.ts` + spec | 136 | 保留星级目标解析（含毫秒取整） |
| `types/daily-challenge.types.ts` | 137 | 保留 `ChallengeScope` / `ChallengeMetric` enum，删掉三张 metric 映射表和两个版本常量 |
| `util/challenge-day-clock.service.ts` | — | 保留，删掉 `closesAt` 和 120 分钟宽限 |

**game 仓库的资产保留比例大幅提高**：6 个采集模块（约 1700 行含测试）从"作废"变为"核心"，加上 Panorama UI，PR #2310 的可保留比例超过 80%。

### 14.2 Phase2（连续完成）：代码不保留，产品规则保留

`daily-challenge-streak.service.ts`（49 行）+ spec（93 行）作废。

`settle()` 的 `previousDays + 1` 和 `streakCycleId` 归属判定，存在的唯一原因是"streak 状态存在每天的文档里，必须跨天读上一天"。新模型下连续天数直接数 `history` 里连续的 `dayId`，这套逻辑失去意义。

**保留的是产品规则**：里程碑 3/7/14/30 天 → 50/120/300/800 赛季积分，到最高里程碑后清零重新循环。

Phase2 还需要决定连续奖励在哪里发——客户端无法知道自己的连续天数是否刚好命中里程碑（那是服务端 history 的信息），所以连续奖励只能由服务端在下次 `/game/start` 通过 `pointInfo` 补发。这会重新引入一条服务端加分路径。

### 14.3 Phase3（全服共同任务）：算法思路保留，代码不保留

约 2000 行作废：`global-freeze.service/store`、`global-ranking.service`、`global-progress.store`、`settlement.service/store`、`day.service/store/entity`、`global-contribution/ranking` 两个 entity，及其全部 spec。

原因是数据模型变了——新设计没有 `daily_challenge_days`、没有挑战日状态机，这些代码全部建立在那两样东西之上。

**值得在 Phase3 照着重写的两个算法**：

1. `global-freeze.store` 的分页流式扫描（500 条一批），避免一次性读取全服贡献
2. `global-ranking.service` 的 cursor 分档：一次遍历算出 top 10% / next 30% / rest，不需要对全量排序

**Phase3 开工前应重新评估共同任务的形态**。共同任务的贡献值必须由服务端聚合，因此它会打破"服务端不看指标数值"这个 Phase1 的核心简化——客户端必须重新上报 `globalMetrics`。如果改成"全服达标 → 所有有效贡献者拿固定积分"，还能省掉排名、`rankings` collection 和冻结时刻，但上报数值这一条躲不掉。排名玩法的价值（80/90/100 三档，最高档比保底多 25%，且玩家局内看不到自己排第几）与它引入的复杂度是否匹配，需要单独决策。

### 14.4 因架构改变而作废（约 6000 行）

`progress.service`（452 + 1103 spec）、`player.service`（381 + 544）、`player.store`（377 + 202）、`progress.store`（194 + 408）、`reward.service/store`（126 + 155 + 426 spec）、`reward-notification`（79 + 150）、`refresh.service`（144）、controllers（88）、全部 dto（约 330）、`match/reward/operation` 三个 ledger entity（73）、`types` 里的映射表部分、module（71）、协议类 spec（267）。

### 14.5 PR 处理建议

**不要在 PR #1040 上改**，另开 Phase1 PR 从 `develop` 切：

- 后端保留比例约 30%，其中大头还是任务池数据，实际等于重写
- #1040 在贡献者的 fork 分支上，在别人分支上做这种规模的重写不合适
- #1040 保持可读状态，Phase2/3 开工时还能回来查 14.2 / 14.3 里那些算法

game PR #2310 的情况不同——采集模块和 UI 都保留，改动集中在"删掉独立接口调用和防回退、新增本地判定与计分"。可以考虑在原分支上迭代，或另开分支 cherry-pick。
