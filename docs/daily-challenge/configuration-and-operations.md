# 每日挑战配置与运营手册

## 1. 当前正式配置

已审核配置文件：

```text
`config/daily-challenge/daily-challenge-hero-pool-v1.json`
```

配置摘要：

| 项目 | 数量或数值 |
|---|---:|
| 配置 ID | `daily-challenge-hero-pool-v1` |
| 版本 | 1 |
| 总任务 | 404 |
| 通用个人任务 | 19 |
| 英雄专属任务 | 381 |
| 共同任务 | 4 |
| 覆盖英雄 | 127 |
| 每名英雄专属任务 | 3 |
| 支持指标 | 19 |

哈希口径：

- 生成报告中的规范化配置 SHA-256：`aa3bf44d051f1a950a94d72c68c3e02b3e32364dd3374eec00edceb29323a822`；
- JSON 原始文件字节 SHA-256：`BC7E72F3FD0AB3711FD6883EA607D6E1E9DA5CAC2E0D387A296B2287633E9BC4`。

两种哈希计算对象不同，核对时必须注明口径。

## 2. 配置结构

根对象：

| 字段 | 作用 |
|---|---|
| `id` | 配置系列标识 |
| `version` | 正整数版本号，发布版本 ID 为 `v{version}` |
| `tasks` | 全部个人和共同任务定义 |
| `globalTargetPolicies` | 共同任务动态目标策略参数 |
| `globalRewardTiers` | 共同贡献档位百分比与奖励 |
| `refreshCostsMemberPoint` | 五次付费刷新的会员积分费用 |
| `streakMilestones` | 连续完成天数与赛季积分奖励 |

任务定义：

| 字段 | 作用 |
|---|---|
| `id` / `revision` | 稳定任务身份和修订号 |
| `enabled` | 是否进入生成池 |
| `scope` | `global`、`personal_general` 或 `personal_hero` |
| `metric` / `unit` | 统计指标与单位 |
| `category` | 通用候选分类去重依据 |
| `title` / `description` | 简中、英文、俄文玩家文案 |
| `target` | 完成目标 |
| `rewardSeasonPoint` | 完成后赛季积分 |
| `weight` | 抽取权重 |
| `expectedMatches` | 运营难度参考 |
| `cooldownDays` | 跨日冷却配置值 |
| `minDataVersion` | 所需游戏端采集版本 |
| `availableFrom` / `availableUntil` | 可选生效区间 |
| `groupTags` / `mutexTags` | 任务分组与互斥 |
| `heroName` | 英雄专属任务的英雄系统名 |
| `targetType` / `damageType` / `controlType` | 任务语义标签 |
| `pureDamageEvidence` | 纯粹伤害英雄任务的技能与版本证据 |

## 3. 当前奖励参数

个人任务：每条 `100` 赛季积分。

共同任务：

| 档位 | 奖励 |
|---|---:|
| 前 10% | 100 赛季积分 |
| 随后 30% | 90 赛季积分 |
| 其余正贡献玩家 | 80 赛季积分 |

连续完成：

| 天数 | 奖励 |
|---:|---:|
| 3 | 50 赛季积分 |
| 7 | 120 赛季积分 |
| 14 | 300 赛季积分 |
| 30 | 800 赛季积分 |

30 天奖励发放后重新进入第 1 天循环；中断时归零。

会员刷新：第一次免费，后续费用依次为 `10、20、30、50、50` 会员积分。

## 4. 当前共同任务

| 任务 | 目标 |
|---|---:|
| 全服击杀 Bot | 10,000 |
| 全服击杀肉山 | 200 |
| 全服摧毁防御塔 | 1,500 |
| 全服造成英雄伤害 | 100,000,000 |

当前挑战日创建使用任务定义中的 `task.target`。`GlobalChallengeTargetService` 已具备基于历史参与人数、最近 7 天结果、上下限与单日变化比例计算目标的能力，但 `DailyChallengeDayService` 尚未调用该结果。因此运营发布时必须把 `task.target` 当作实际生效目标，不能把 `globalTargetPolicies` 的计算值当作线上生效值。

## 5. 文案规则

- 面向玩家写自然任务句，不出现字段名或实现术语。
- 时长统一使用“秒”或数字加 `s`，配置仍以毫秒统计。
- 英雄专属任务使用“使用某英雄……”句式。
- Bot、肉山、防御塔、控制和伤害类型使用游戏内统一术语。
- 三语标题与描述必须同时填写，不能留下空字符串或本地化 key。
- 纯粹伤害英雄任务必须提供 `pureDamageEvidence`，并确认项目当前英雄技能确实能产生对应伤害。
- `minDataVersion` 不得低于指标协议要求。

## 6. 校验门槛

保存草稿时，服务会返回全部 `issues`，即使存在问题也会保存草稿。发布操作只拦截 `severity = error`。

读取发布配置时，`getPublished()` 当前只接受 `issues.length === 0` 的版本。因此实际运营发布门槛必须是：

```text
0 errors / 0 warnings
```

若带 warning 的草稿被发布，发布指针可能已经更新，但正常发布配置读取会跳过该版本并回退查找其他有效版本。发布前必须处理全部 warning。

主要校验包括：

- 配置 ID、版本和任务池结构；
- 任务 ID 唯一、revision、启用状态、范围、指标和单位；
- 目标、奖励、权重、预计局数和冷却天数；
- 英雄系统名、任务标签和时间范围；
- 每种指标的最低数据版本；
- 纯粹伤害证据；
- 共同任务目标策略；
- 共同奖励百分比与积分顺序；
- 恰好五档正整数付费刷新费用；
- 连续里程碑天数严格递增且奖励为正整数。

## 7. 发布操作

当前没有独立运营 GUI，使用 NestJS API 或 Swagger。

### 7.1 保存草稿

```http
PUT /admin/daily-challenge/config/draft
x-admin-actor: operator-name
Content-Type: application/json
```

请求体为完整配置 JSON。保存后检查返回的 `issues`，必须为零问题。

### 7.2 发布

```http
POST /admin/daily-challenge/config/publish
x-admin-actor: operator-name
```

发布前确认：

1. 草稿版本号高于当前正式版本，或相同版本内容完全一致。
2. 校验结果为 `0 errors / 0 warnings`。
3. 任务数量、英雄数量、奖励和刷新费用与审核单一致。
4. 全部 19 种指标满足游戏端 `dataVersion = 2`。
5. 纯粹伤害证据中的英雄、技能和游戏版本仍有效。
6. 原始文件哈希与待上传文件一致。

发布后读取：

```http
GET /admin/daily-challenge/config/published
```

核对 `id`、`version`、任务数量和关键奖励值。

### 7.3 版本查询

```http
GET /admin/daily-challenge/config/versions
GET /admin/daily-challenge/config/versions/v1
```

版本列表用于核对发布时间、操作者、状态和完整快照。

### 7.4 回滚

```http
POST /admin/daily-challenge/config/versions/v1/rollback
x-admin-actor: operator-name
```

回滚只移动 `published` 指针并记录审计，不复制历史版本，也不改变已经创建的挑战日。回滚后再次读取 `published`，并创建一个测试挑战日验证冻结版本。

## 8. 日常运营检查

每日检查：

- 当日 `daily_challenge_days/{dayId}` 已创建；
- `configVersionId` 与预期正式版本一致；
- 共同任务和目标正确；
- 玩家快照能生成三条候选；
- 会员刷新费用与剩余次数正确；
- `/game/end` 后比赛流水、个人进度和共同贡献一致；
- 上一挑战日能在后续开局触发追赶结算；
- 奖励流水与赛季积分增量一致；
- `pending -> notified -> viewed` 正常推进。

## 9. 积分控制

运营调整奖励时同时观察：

- 每日个人任务完成率；
- 共同任务达成率和有效贡献人数；
- 三个共同档位的实际人数；
- 3/7/14/30 天连续完成分布；
- 单个活跃玩家每日与每 30 天周期可获得的赛季积分；
- 会员免费刷新和付费刷新次数分布；
- 异常高单局指标被拒绝的数量。

优先通过任务目标、权重和共同目标调节完成率；修改赛季积分前先计算整季积分产出。已冻结挑战日不受新配置影响。

## 10. 当前能力边界

- 跨日冷却：生成器接受 `recentTaskIds`，但玩家初始化、刷新和共同任务创建当前没有传入跨日历史；实际只保证同一天刷新优先避开已见任务。
- 动态共同目标：计算服务存在，但挑战日仍采用任务静态 `target`。
- 运营入口：当前仅 API/Swagger，没有独立页面。
- 日终调度：当前由 `/game/start` 调用 `reconcile()` 追赶，没有独立 cron。

## 11. 个人轮数与星级运营配置

`DailyChallengeConfigSnapshot` 支持以下版本化字段；旧配置缺字段时由后端补默认值：

| 字段 | 默认值 | 用途 |
|---|---:|---|
| `personalRoundsPerDay` | `3` | 每日个人挑战轮数 |
| `personalStarRewards` | `{1:80,2:100,3:120}` | 各星级赛季积分 |
| `personalStarWeights` | `{1:1,2:1,3:1}` | 各候选独立抽取星级的相对权重，单项可为 0、总和必须大于 0 |
| `personalDefaultStarMultipliers` | `{1:0.75,2:1,3:1.5}` | 未配置任务级目标时，相对于二星基础目标的倍率 |
| `tasks[].starTargets` | 可选 | 任务级一/二/三星明确目标，优先于默认倍率 |
| `refreshCostsMemberPoint` | 当前五项 | 每日付费刷新价格表；数组长度即每日付费刷新上限 |

Validator 要求轮数为正整数；星级奖励为正整数；权重为非负有限数且总和大于 0；倍率为正有限数；`starTargets` 的 1/2/3 目标均为正整数。共同任务禁止配置 `starTargets`。

### 11.1 积分膨胀控制

运营可同时调整 `personalStarWeights`、`personalStarRewards`、`personalRoundsPerDay`、任务基础 `target`、任务级 `starTargets` 和 `personalDefaultStarMultipliers`。降低高星权重、提高高星目标或降低每日轮数可压低日均产出；调整奖励前应结合完成率与玩家分层评估，不能只修改单一数值。发布后，既有玩家日状态继续使用冻结的轮数、星级、目标、奖励和配置版本，不被新配置追溯改变。
