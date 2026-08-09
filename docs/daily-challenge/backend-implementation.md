# 每日挑战后端实施说明

## 1. 模块边界

`DailyChallengeModule` 是每日挑战后端唯一业务模块，注册玩家与配置控制器、Firestore 实体以及挑战日、候选生成、刷新、进度、共同冻结、排名、连续完成、奖励和通知服务。

模块通过 `GameModule` 接入既有开局与结算接口：

- `/game/start` 提供服务器记录的比赛开始时间、玩家挑战快照和待展示奖励；
- `/game/end` 接收比赛指标，把正常结算玩家的贡献写入挑战流水，并返回结算后的玩家挑战快照；
- 会员刷新复用现有会员状态和会员积分账户；
- 奖励写入复用玩家赛季积分账户，不建立平行积分余额。

## 2. 服务职责

| 服务 | 职责 |
|---|---|
| `ChallengeDayClockService` | 按服务器本地自然日计算 `dayId`、开始、结束和宽限截止时间 |
| `DailyChallengeConfigService` | 草稿保存、校验、发布版本读取、版本列表和回滚 |
| `DailyChallengeDayService` | 为挑战日冻结配置版本与一个共同任务 |
| `DailyChallengeGenerationService` | 按权重、分类、英雄和互斥标签生成三条个人候选 |
| `DailyChallengePlayerService` | 初始化玩家日状态、读取快照、接取任务、已查看状态 |
| `DailyChallengeRefreshService` | 校验会员、扣除会员积分并刷新候选任务 |
| `DailyChallengeProgressService` | 校验比赛归属与数据版本，幂等写入个人进度和共同贡献 |
| `DailyChallengeGlobalFreezeService` | 宽限期结束后冻结共同贡献、计算总进度和排名快照 |
| `DailyChallengeGlobalRankingService` | 按贡献值和 SteamID 生成确定性奖励档位 |
| `DailyChallengeStreakService` | 结算个人连续完成天数、里程碑和循环重置 |
| `DailyChallengeRewardService` | 生成固定奖励 ID 并调用奖励事务入账 |
| `DailyChallengeRewardNotificationService` | 把奖励流水转换为 `pointInfo`，提供未读数、记录和已查看操作 |
| `DailyChallengeSettlementService` | 追赶已结束挑战日并推进完整日终状态机 |

每项持久化职责由对应 `*.store.ts` 封装，业务服务不直接维护第二份数据库状态。

## 3. 开局链路

`GET /game/start` 当前顺序为：

1. 校验服务器类型和 SteamID。
2. 创建或更新玩家资料。
3. 发放活动奖励。
4. 按现有每日边界发放会员每日积分。
5. 调用 `DailyChallengeSettlementService.reconcile(matchStartedAt)` 追赶已结束挑战日。
6. 调用 `claimPointInfo()` 领取待展示的每日挑战奖励通知。
7. 读取玩家资料、会员、属性、设置、统计和觉醒数据。
8. 获取当日每日挑战快照。
9. 返回 `matchStartedAt`、`dailyChallenges` 和合并后的 `pointInfo`。

每日挑战结算、通知或快照失败会记录警告，但不会阻断基础开局响应。`matchStartedAt` 由后端生成，是比赛归属挑战日的唯一时间锚点。

`GET /daily-challenge/match-start` 提供相同的挑战快照能力，主要用于每日挑战协议的独立调用和验证。

## 4. 玩家日状态初始化

玩家第一次读取当日快照时，后端：

1. 获取或创建当日 `daily_challenge_days`。
2. 读取该挑战日冻结的配置版本。
3. 根据 `dayId + steamId + refreshIndex + configVersion` 生成确定性候选。
4. 建立两条不同分类的通用任务和一条英雄专属任务。
5. 把候选、共同任务、奖励档位、刷新费用与连续里程碑保存为玩家日快照。

候选和已接任务保存 assignment 快照，因此配置后来发布新版本不会修改历史挑战日或已经发给玩家的任务内容。

## 5. 接取与刷新

### 5.1 接取

接取请求必须包含当前 `dayId`、候选 `assignmentId` 和唯一 `requestId`。后端只允许在挑战日 `open` 状态下接取当前候选；成功后写入 `acceptedTask`、`acceptedAt`，并返回新的完整玩家快照。

同一 `requestId` 重试返回同一业务结果。当天已有已接任务时返回 `already_selected`。

### 5.2 刷新

刷新只允许有效会员且尚未接取个人任务的玩家执行：

- 第一次刷新免费；
- 后续依次消耗配置中的五档会员积分；
- 扣费与候选更新在同一事务中完成；
- 当天已经展示过的任务写入 `seenTaskIds`，刷新时优先避开；
- 费用用尽、会员无效或余额不足时返回稳定业务错误码。

刷新消耗会员积分，任务与连续奖励发放赛季积分，两类积分不可混用。

## 6. 比赛结算接入

`POST /game/end` 先执行项目原有玩家结算，再处理 `dailyChallenge` 扩展数据。

挑战进度只接受同时满足以下条件的玩家：

- SteamID 有效；
- `battlePoints` 满足基础结算规则；
- 玩家属于基础 `eligiblePlayers`；
- 玩家未断开连接；
- 挑战数据中的 `normallySettled` 为真；
- 比赛 `dayId` 与 `matchStartedAt` 对应的挑战日一致；
- 指标属于协议支持范围，单位、数据版本和单局上限有效。

写入时：

- 个人任务要求 `acceptedAssignmentId` 匹配；
- 英雄专属任务还要求结算英雄与任务 `heroName` 匹配；
- 个人进度最多累计到任务目标；
- 共同任务不要求玩家接取个人任务，只累计与当天共同任务指标相同的正贡献；
- `matchId + steamId` 的比赛流水防止重试重复累计。

对于完成个人任务的玩家，`DailyChallengeProgressStore.runMatchContribution()` 在同一个 Firestore transaction 中完成玩家挑战状态、共同贡献、比赛 ledger、玩家 `seasonPointTotal` 和个人奖励 ledger 的写入。任一写入失败，整组每日挑战变更都不会提交，不会出现“轮次已推进但积分未到账”或“积分已到账但没有奖励流水”的半完成状态。

同一 `/game/end` 重试读取既有比赛 ledger：不会再次累计、推进轮次或增加积分，但会依据 `personalRewardLedgerId` 稳定回显同一笔个人奖励，供游戏端恢复丢失的首次响应和赛后展示。仅对旧版本遗留、带个人奖励快照但没有 `personalRewardLedgerId` 的 ledger 保留窄范围幂等补偿。
挑战进度处理成功后，控制器使用同一个 `challengeNow` 为通过基础结算且未断开的玩家重新读取完整快照，并通过 `/game/end.dailyChallenges` 返回。这样第 1/2 轮完成后的下一轮候选、第 3 轮完成态、正式进度和奖励记录可以在结算后立即同步到游戏端，不依赖玩家再次进入或手动请求。

`dailyChallengeRewards` 与 `dailyChallenges` 都是可选字段：有任一字段时返回对象；两者都为空时保留原有字符串响应。结算后快照读取失败只记录警告，不撤销已经提交的基础结算或每日挑战进度；进度处理失败时不再读取可能误导客户端的结算后快照。

每日挑战进度失败会记录警告，不回滚已经完成的基础游戏结算。

## 7. 日终结算

挑战日生命周期为：

```text
open -> closing -> frozen -> rewarding -> settled
```

- 到 `endsAt` 后进入 `closing`；
- `closing` 保留 120 分钟比赛回传宽限期；
- 到 `closesAt` 后冻结共同贡献并写入排名；
- `rewarding` 处理个人任务、连续完成和共同档位奖励；
- 全部玩家状态和奖励处理完成后标记为 `settled`。

当前 `reconcile()` 由下一次 `/game/start` 触发，没有独立定时任务。服务会追赶尚未完成的历史挑战日；如果午夜后长期没有新开局，奖励会在后续首次开局时结算并展示。

## 8. 奖励与通知

奖励来源为：

- `personal`：个人任务固定赛季积分；
- `global`：共同任务档位赛季积分；
- `streak`：连续完成里程碑赛季积分。

奖励流水使用确定性 ID：

```text
个人：dayId_steamId_personal_assignmentId
共同：dayId_steamId_global
连续：dayId_steamId_streak_streakCycleId_streakDays
```

奖励流水创建与玩家赛季积分增加处于同一 Firestore 事务。个人任务即时奖励进一步与玩家挑战状态、共同贡献和比赛 ledger 共用比赛贡献事务；共同与连续奖励仍通过独立奖励事务入账。重复执行结算时，已存在的奖励 ID 不会再次增加积分。

通知状态在奖励流水中推进：

```text
pending -> notified -> viewed
```

`claimPointInfo()` 只把 `pending` 奖励转成既有 `pointInfo` 展示数据并标记 `notified`；积分已在奖励事务中发放。玩家打开奖励记录后，`view` 把未查看记录标记为 `viewed`。

## 9. 故障隔离

- 每日挑战快照故障不阻断基础 `/game/start`；
- `/game/end` 先完成既有玩家结算，再调用每日挑战；每日挑战事务失败不会撤销基础结算，也不会留下部分每日挑战写入；结算后快照读取失败也只降级为无 `dailyChallenges` 响应；
- 业务操作依靠稳定错误码而不是错误文案驱动客户端；
- 操作、比赛和奖励各有独立幂等流水；
- 挑战日和玩家状态保存配置快照，避免发布变更污染历史数据。

## 10. 三轮个人挑战实现

### 10.1 生成与冻结

`resolvePersonalChallengeConfig` 负责对已发布配置补齐兼容默认值。`DailyChallengeGenerationService` 使用 `dayId + steamId + currentRound + refreshIndex + configVersion` 作为候选确定性种子，并为三个候选分别使用独立星级种子。每轮仍固定生成两条不同类别的 `personal_general` 和一条 `personal_hero`。

`DailyChallengePlayerService` 将实际轮数、轮次、星级、星级目标、星级奖励和配置版本写入 assignment 快照。任务定义提供 `starTargets` 时直接采用对应目标；否则以旧 `target` 作为二星基准，根据默认倍率换算并按单位取整，结果最少为 1。

### 10.2 完成与推进

`DailyChallengeProgressService` 在比赛贡献事务内完成以下操作：

1. 依据 `matchId_steamId` ledger 保证重试幂等；
2. 将进度封顶到当前快照目标；
3. 完成时把任务追加到 `completedTasks`，并在同一比赛贡献事务内按快照增加赛季积分、创建个人奖励 ledger；
4. 第 1/2 轮清空接取与进度，增加 `currentRound` 并确定性生成下一组三候选；
5. 最后一轮清空候选并设置 `completedAt`。

刷新次数、刷新序号和已展示任务集合属于玩家整日状态，推进轮次时原样保留。`DailyChallengeSettlementService` 只有在 `completedAt` 存在、`completedRoundCount >= totalRounds` 且已完成任务数达到总轮数时才计算连续完成；跨日兜底逐条读取 `completedTasks` 补发个人奖励，奖励 ledger 防止重复入账。

`DAILY_CHALLENGE_SNAPSHOT_VERSION` 已从 1 升为 2；`DAILY_CHALLENGE_MATCH_DATA_VERSION` 保持 2。
