# 每日挑战 Phase1 重新设计

日期：2026-08-11
状态：待评审
替代：PR #1040（firebase）+ PR #2310（game）的后端设计

> 标识符统一用 `task`，不再用 `challenge`（见 10.1）。「每日挑战」在本文中指这个**功能**，也是界面显示名；代码里的模块、类型、字段一律 `dailyTask` / `task`。

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

每天 3 轮。每轮玩家面对 3 个候选任务——**必定 1 个通用 + 1 个英雄专属，第 3 个随机**——自由选一个去完成。

- 候选在 `/game/start` 时由服务端生成并随响应下发，**带 `target` 和 `rewardSeasonPoint`**
- 玩家在客户端本地选择，**不产生任何 API 调用**
- 客户端局内累计指标、判定达标、结算时把奖励计入本局赛季积分
- `/game/end` 上报完成的 `taskId` 与该任务的奖励值，服务端记一轮完成
- 完成一轮后，下一轮候选在**下一次** `/game/start` 生成；同一局内不推进第二轮
- 未完成时候选不变，玩家下一局可以改选同一组里的另一个

**`/game/start` 在 loading 阶段调用**（`Game.StartGame()` 设置 `loading_status = 1` 时），**早于选英雄**。因此玩家先看到候选、再决定选什么英雄——英雄专属任务是可以主动达成的，不是抽到就认命。

轮数 3 是当前默认值，后续按实际情况调整；它只是一个常量，改动不影响任何数据结构。

### 3.2 进度模型

**单局达标才算完成，不跨局累积。**

这不只是简化——判定在客户端做，而 Panorama / vscripts 无法跨局持久化进度，所以跨局累积在这个架构下不可实现。目标值必须按"单局可达"标定。

不存在"接取"概念，服务端不存 `progress`。

### 3.3 星级

星级决定目标与奖励：

| 星级 | 目标倍率 | 赛季积分 |
| --- | --- | --- |
| 1★ | 1.0 | 60 |
| 2★ | 1.5 | 80 |
| 3★ | 2.0 | 100 |

**每轮的三个候选固定是 1★ / 2★ / 3★ 各一个**，只有"哪个候选拿到哪个星级"由 seed 随机（6 种排列）。

单日赛季积分区间 180 ~ 300：三轮都选 1★ 得 180，都选 3★ 得 300。

#### 为什么不独立掷星级

早期设计是每个候选独立掷、权重 1:1:1，那样有 1/27 的概率三个候选全 3★、1/27 全 1★，合计约 7.4% 的轮次难度维度失效。

全 1★ 无所谓，全 3★ 有实际问题：按 12.4 的标定计划 3★ 对应 P75，三个都是 P75 时这一轮明显偏难，而失败不消耗轮次，玩家会卡在当前轮、后面的轮次开不出来。撞在第 1 轮大约每月一次。

固定分配之后：

- 三个候选在 **metric 和难度两个维度上都真正区分开**，而独立掷有 7.4% 的概率让难度维度退化
- 每轮变成干净的**难度三选一**——求稳拿 1★ 60 分，敢拼上 3★ 100 分，玩家有明确取舍
- 每轮必定存在一个 1★，**任何一轮都不会因为难度卡死**
- 候选卡 UI 上三个星级徽章并排，一眼能看懂

代价是星级与候选槽位绑定：3★ 若恰好落在玩家不玩的英雄任务上，就得在"换英雄"和"拿低分"之间选。这是合理取舍，不是缺陷。

**小整数指标用加法档，大数值用乘法档。** 乘法对小整数会退化——`target = 1` 时三档算出 `1 / 1 / 2`，`target = 2` 时 `2 / 2 / 3`，都有重复：

```ts
const SMALL_TARGET_THRESHOLD = 10;

const scaled =
  task.target < SMALL_TARGET_THRESHOLD
    ? task.target + (star - 1)              // t / t+1 / t+2
    : task.target * multipliers[star];      // 1.0 / 1.5 / 2.0

return Math.max(1, Math.round(scaled));
```

| 指标 | target | 三档 |
| --- | ---: | --- |
| `roshan_kills` | 1 | 1 / 2 / 3 |
| `tower_kills` | 3 | 3 / 4 / 5 |
| `kills` | 60 | 60 / 90 / 120 |
| `stun_duration` | 45（秒） | 45 / 68 / 90 |
| `hero_damage` | 500000 | 500000 / 750000 / 1000000 |

`stun_duration` 的 target 为整数秒、通常两位数，走乘法档。判定时与 `GetStuns()` 的浮点返回值直接比较，不取整。

若不这样处理，`roshan_kills` 要靠乘法拉开三档就得把 target 标到 ≥ 3，意味着 3★ 需要单局击杀 5 次肉山，不现实。顺带把 `tower_kills` 从 `2 / 3 / 5` 修正为 `3 / 4 / 5`，跨度更合理。

原实现的毫秒取整分支删除——`stun_duration` 改用 `GetStuns()` 后单位是秒（见 5.2），不需要取整到整千。

### 3.4 英雄专属任务

每轮 3 个候选中**至少 1 个、最多 2 个**是英雄专属；出现两个时必定是**两个不同英雄**。客户端在判定时检查本局英雄是否匹配 `heroName`，不匹配则该任务不可完成。

候选早于选英雄下发（见 3.1），且**本模式允许重复选择同一英雄**，所以不存在"英雄被别人抢走导致任务不可能完成"的情况——玩家只要愿意就一定能选到。

**UI 必须在选英雄阶段就展示英雄专属候选**，否则玩家选完英雄才看到"用莉娜打出 X 伤害"，这一轮的英雄任务就白白作废了。

### 3.5 生效条件（模式门控）

自定义选项会让 target 失去意义——5 倍金钱下「打 50 万英雄伤害」是白送。**只有预设难度 1~8 的对局启用每日任务，自定义模式一律禁用。**

判定在客户端：

```ts
function isDailyTaskEnabled(): boolean {
  if (EnvironmentHelper.IsInvalidGameEnvironment()) { // 作弊模式或 localhost
    return false;
  }
  return GetMapName() !== 'custom';
}
```

#### 为什么用地图名判断

难度取值由**地图**锁死（`content/panorama/layout/custom_game/team_select/team_select.js`）：

| 地图 | `difficulty` | 自定义选项下拉 |
| --- | --- | --- |
| `dota` | 1~5 | disabled |
| `hard` | 6~8 | disabled |
| `custom` | **只能是 0** | 解锁 |

选项下拉的 `enabled` 就是靠"难度是否为 0"控制的（见 `content/panorama/scripts/custom_game/game_mode.js` 中 `ApplyCustomPresetToDropdowns` 的调用条件）。因此，地图名与每日任务的模式门控一一对应：

- `dota` / `hard` 地图只能使用预设难度，`custom` 地图才会解锁自定义选项
- `GetMapName()` 在选英雄和难度投票完成前就可确定，不需要等待 `difficulty`
- `GetDifficultyMultiplier` 的 `switch` 命中 1~8 时压根不读 `option`，`GetCustomModeMultiplier` 只在 custom 地图（difficulty 0）上执行

| 场景 | 每日任务 |
| --- | --- |
| dota 地图，难度 1~5 | 生效 |
| hard 地图，难度 6~8 | 生效 |
| custom 地图（自定义模式），无论选项如何 | 禁用 |
| 作弊模式 / localhost | 禁用 |

#### 掉线玩家不结算

**结算时 `isDisconnected` 为真的玩家，本局不算完成任何任务、不加分**——哪怕他在退出之前指标已经达标。

两端都要执行这条，且必须是同一条规则：

- **服务端**：8.3 的准入条件已含 `!isDisconnected`，不写 `completedTasks`、不累加 `todaySeasonPoint`
- **客户端**：`game-end.ts` 构建 `playerDto` 时，若该玩家 `isDisconnected`，**既不设 `dailyTask` 字段，也不把奖励加进 `battlePoints`**

客户端那半边不能省。若客户端照常加分而服务端跳过记录，玩家就拿到了分但轮次没被消耗——下一局面对同一组候选，可以把同一个任务再完成一次再拿一次分。这正是 8.3.1 所说"客户端 bug 导致的加分与轮次记录不一致"，而服务端按设计不做兜底校验。

`isDisconnected` 在结算时客户端本来就知道（它是 `GameEndPlayerDto` 的现有字段），不需要新增任何数据。

#### 为什么不用难度倍率做门控

早期设计用 `GetDifficultyMultiplier(...) >= 1` 当门控，有两个问题：

1. **它多放行了 custom 地图。** difficulty 为 0 时走 `GetCustomModeMultiplier`，一字未改得 1.0、敌方金钱 20 倍得 2.3，都会通过——而这些正是要拦的自定义模式。
2. **倍率是积分缩放函数，不是指标分布保持函数。** 敌方金钱 20 倍倍率 2.3（更难，加分更多），但英雄伤害的可得量被推高数倍（任务反而更容易）。拿它当二值门控是把两件事混为一谈。

改成白名单后，`DAILY_TASK_MIN_MULTIPLIER`、倍率场景表、以及**秒活的独立规则**全部不再需要——复活时间下拉只在 custom 地图上可用，而 custom 已经整个禁用了。

#### 客户端与服务端的分工

禁用时客户端：**不展示候选、不判定、不计分、不上报 `dailyTask`**。服务端因此不会记录轮次，玩家**不损失当天的轮次机会**——下一局正常模式仍然面对同一组候选。

服务端不参与判定：`/game/start` 照常下发候选（此时难度可能还在投票中），由客户端在局内决定是否启用。

#### 标定样本因此天然对齐

`game_end_player` 已经在发 `difficulty`（`api/src/analytics/analytics.service.ts`），12.1 的标定查询直接 `WHERE difficulty BETWEEN 1 AND 8` 就得到与线上启用条件完全一致的样本，不需要解析 `game_options`，也不需要新增 GA4 参数。

**dota(1~5) 与 hard(6~8) 不做区分，1~8 共用同一套任务与同一套 target。** 两张地图的 bot 强度不同、指标分布也不同，但分层会让任务池和标定复杂度翻倍，收益不足以抵消。

### 3.6 已删除的机制

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

- **模式门控**：按 3.5 判定本局是否启用——只认预设难度 1~8，自定义模式一律禁用
- **指标读取**：10 个指标全部走 `PlayerResource` 原生 API，局内展示与结算判定时各读一次。**没有采集代码**——无定时器、无 filter、无高频事件监听，见 5.2 / 5.2A
- **达标判定**：用服务端下发的 `metric` / `target` / `heroName` 在局内判定
- **计分**：达标后把 `rewardSeasonPoint` 计入本局 `battlePoints`；**`isDisconnected` 的玩家不计分、不上报**，与服务端 8.3 的准入条件保持一致（见 3.5）
- **全部文案**：`addon_schinese/english/russian.txt`，按 `scope` + `metric` 拼本地化 key，替换 `{hero}` / `{target}`。英雄名走 DOTA 自带的 `#npc_dota_hero_*`。`unit`（次数/伤害/秒）由 `metric` 在客户端映射
- **候选选择**：本地状态，零网络请求
- **UI**：HUD 入口、挑战面板、候选卡、星级徽章、今日记录、历史列表、结算页积分

### 4.2 API

职责收缩为两件事：

- **候选生成**：确定性抽取 + 星级掷点，下发 `taskId` / `scope` / `metric` / `heroName` / `star` / `target` / `rewardSeasonPoint`
- **轮次记录**：`/game/end` 上报 `taskId` + 奖励值后记一轮完成，推进轮次、跨天重置、维护 history

`/game/end` 上服务端是纯记录器——不重算候选、不验证 taskId、不验证数值、不发放积分（见 8.3.1）。

**服务端不再需要**：`TaskMetric` → `GameEndPlayerDto` 字段映射、`DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION`、`DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION`、`DAILY_CHALLENGE_METRIC_UNIT`、达标判定逻辑、赛季积分发放路径。

**候选生成必须留在服务端**——否则玩家可以自己宣称抽到了三个最容易的任务。这是唯一不可下放的部分。`target` 和 `rewardSeasonPoint` 由服务端随候选下发，客户端只是执行服务端定的规则，**任务池仍然是单一来源**，不存在两端各维护一份的漂移风险。

## 5. 指标范围与口径

**10 个指标，全部来自 DOTA 原生 API。** 从原 19 个收敛而来，依据是一条硬约束加两条清理：

> **客户端不得为每日挑战引入任何定时器、伤害 filter 或高频事件监听。** 10v10 后期伤害与 modifier 事件频率极高，任何 per-event 回调都是卡顿风险，而每日挑战不值得让对局体验承担这个代价。

在这条约束下，只有能通过 `PlayerResource` 在结算时刻一次读取的指标才能保留。此外语义重复的合并（`bot_kills` → `kills`，见 5.3）。

服务端不看数值，指标多少对服务端没有成本——收敛完全是为了客户端性能。`TaskMetric` enum 保留（候选要下发 metric 给客户端），`DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION` / `_UNIT` / `_MAX_MATCH_CONTRIBUTION` 三张表全部删除。

### 5.1 指标清单

| 指标 | 来源 |
| --- | --- |
| `kills` | `PlayerResource.GetKills()` |
| `assists` | `PlayerResource.GetAssists()` |
| `last_hits` | `PlayerResource.GetLastHits()` |
| `tower_kills` | `PlayerResource.GetTowerKills()` |
| `hero_damage` | `PlayerResource.GetRawPlayerDamage()` |
| `healing` | `PlayerResource.GetHealing()` |
| `total_gold_earned` | `PlayerResource.GetTotalEarnedGold()` 减虚拟金币回转 |
| `damage_taken` | 遍历敌方玩家 `GetDamageDoneToHero()` 求和 |
| `stun_duration` | `PlayerResource.GetStuns()`，单位**秒（浮点）**，含缠绕时长 |
| `roshan_kills` | `PlayerResource.GetRoshanKills()` |

全部与 `game-end.ts` 同源。客户端**没有任何采集代码**：局内进度展示时读一次，结算判定时读一次，成本是 10 次 `PlayerResource` 调用。

**`GetTotalEarnedGold()` 的口径要与 `game-end.ts` 保持一致**：减去 `player_virtual_gold` 的 `transferred_back_total`，否则与结算页 money 列对不上。

### 5.2 删除 6 个控制时长指标，`stun` 改用原生 API

原实现每 **0.25 秒**扫描全部敌方 bot 英雄的 modifier 来累计控制时长。逐层拆开单次扫描的成本：

```
getBotHeroes()                    24 次循环 × 3 调用                  ≈ 72
每个 bot 英雄（10 个）             isEnemyBotRealHero 6 + FindAllModifiers
每个 modifier（20~40 个）：
  isActiveModifier                GetDuration + GetRemainingTime       2
  IsNull / GetCaster / GetAuraOwner                                    3
  resolveHumanPlayerId            owner 链回溯                       3~5
  isEnemyTeam                                                          2
  classify:  CheckStateToTable    1 次调用 + 一张 ~50 项的表分配        1
             IsDebuff / IsStunDebuff                                   2
             HasFunction × 10                                         10
             GetName() × 5   ← slowModifierNames.some() 每次重新调用    5
                                                              小计 ≈ 29
```

**10 英雄 × 30 modifier × 29 ≈ 8,700 次引擎调用/扫描，×4 次/秒 ≈ 每秒 3.5 万次**，外加每秒约 1,200 次表分配（`CheckStateToTable` 每次新建）。在 10v10 这种本就吃服务器的模式里会有感知，GC 压力比调用次数更麻烦。

`@moddota/dota-lua-types@4.38.2` 里确认存在原生 API：

```ts
GetStuns(playerId: PlayerID): number;         // DOTA 记分板同款「Stuns」
GetRoshanKills(playerId: PlayerID): number;
```

**7 个控制时长里只有 `stun` 有原生 API**，`slow` / `root` / `silence` / `taunt` / `break` / `debuff` 都没有。因此：

- `stun_duration` 改用 `GetStuns()`——DOTA 官方口径，比自己扫 modifier 更权威
- 其余 6 个控制指标**删除**
- `roshan_kills` 改用 `GetRoshanKills()`
- **轮询整个消失**：`daily-challenge-modifier-classifier.ts`（87 行）、telemetry 里 0.25 秒扫描循环、`ignoreCurrentlyActiveEffectsForMetric`、`entity_killed` 监听全部删除

代价：约 110 条英雄任务 + 6 条通用任务要换指标。控制型英雄的任务特色会变弱，但多数可替代——斧王换 `damage_taken`（承受伤害本就是他的定位），水晶室女换 `stun_duration`（冰封禁制与大招都算眩晕）。

被删掉的 `slow` 本来就依赖一个**硬编码白名单**（5 个 modifier 名）加移速 `modifierfunction` 匹配，覆盖不完整——不在名单里的减速技能永远统计不到，配了任务也无法完成。删除同时消除了这个隐患。

#### `GetStuns()` 的口径（已实机验证）

- **单位为秒，返回浮点数**。target 按整数秒标定（如 45），判定用浮点比较 `GetStuns() >= target`
- **缠绕（root）时长计入**。因此原任务池里 8 条 `root_duration` 任务可机械替换为 `stun_duration`，见 12.2

**UI 展示必须用 `Math.floor()` 取整，不能用 `Math.round()`。** 玩家在 44.7 秒时若显示「45 / 45」却未完成，会直接被判定为 bug；向下取整显示「44 / 45」才与判定一致。

### 5.2A 删除伤害分类（`physical` / `magical` / `pure`）

这三个指标是唯一没有原生 API 的一组，原实现靠 `SetDamageFilter` 逐次伤害累加。**两条独立的理由都指向删除。**

#### 理由一：per-damage 回调是卡顿风险

10v10 后期伤害事件频率极高——小兵互殴、防御塔攻击、AOE 技能对多目标、持续伤害每跳，全部会触发 filter。

原实现的早退顺序是好的：`isEnemyBotRealHero(victim)` 是第一道过滤，打小兵、打防御塔、打建筑、打真人玩家的伤害**都不会被计入**。但**回调本身仍要为每一次这样的伤害触发再拒绝**——约 8 次引擎调用。命中的路径（打到敌方 bot 英雄）还要额外走 owner 链回溯，每次分配一个数组和一个 Set。

即便加上"预建 bot 英雄 entIndex 集合"、"先解 victim 再解 attacker"、"owner 回溯加快速路径"这三条优化，也只是把成本压低，无法消除"每次伤害都要进一次 Lua"这个本质开销。而后期伤害频率是随对局进程增长的，最卡的时刻恰好是回调最密集的时刻。

**对局流畅度优先于任务多样性**，因此不做优化、直接删除。

#### 理由二：税前伤害不衡量真实贡献

`SetDamageFilter` 在伤害落地前触发，拿到的是**减免前**的原始值，引擎随后才套用护甲、魔抗、伤害格挡。

这让指标本身失去意义：同样 1000 点税前物理伤害，打脆皮和打高护甲目标的实际贡献差一倍以上，但记账完全相同。玩家为了刷任务会倾向于打最肉的目标——与"打出有效伤害"的直觉背道而驰。

而 `GetRawPlayerDamage()`（即 `hero_damage`）是 DOTA 记录的**实际造成伤害**，口径正确。这也意味着两者根本无法互相换算，`physical + magical + pure` 会显著大于 `hero_damage`。

#### 后果

- `TaskMetric` 删除 `PHYSICAL_DAMAGE` / `MAGICAL_DAMAGE` / `PURE_DAMAGE`
- 客户端删除 `daily-challenge-damage-observer.ts`、`daily-challenge-damage-event.ts`
- 删除后 `telemetry.ts` 再无任何输入源，`accumulator.ts` 再无写入方，`ownership.ts` 再无调用方——三者一并删除
- **客户端的采集代码归零**，见 13.3
- 伤害类任务统一用 `hero_damage`；英雄差异化改由 `heroName` + 目标值 + 其他指标承担

主分支未使用 `SetDamageFilter`（现有三个 filter 是 `SetExecuteOrderFilter`、`SetModifyGoldFilter`、`SetModifyExperienceFilter`），删除不影响任何现有功能。

### 5.3 删除 `bot_kills`

`bot_kills` 与 `kills` 在本模式下语义几乎等价——都是击杀敌方英雄，差别只有「排除真人玩家」和「排除转生中的目标」两点，关系恒为 `bot_kills ≤ kills`。保留两个指标会让同一轮的两个通用候选出现「击杀 20」和「击杀 50 个 Bot」这种实质重复的选项，把三选一稀释成二选一。

统一用 `PlayerResource.GetKills()`：

- `general_bot_kills`（50）删除，合并进 `general_kills`
- `hero_sniper_3`（50）、`hero_phantom_assassin_2`（60）改用 `KILLS`
- `global_bot_kills`（10000，Phase3）改为按 `kills` 全服累计
- `TaskMetric.BOT_KILLS` 从 enum 删除
- 客户端 `telemetry.ts` 的 `bot_kills` 计数分支删除
- 三语资源里 3 条 `bot_kills` 文案删除

### 5.4 运维约定（替代 `dataVersion`）

新增 metric 的任务，必须在客户端发布**之后**才上线到任务池。DOTA2 自定义游戏进服强制更新，客户端版本分裂窗口很短。

**客户端必须对无法识别的候选做保护。** 这不只是"新增 metric"这一种情况——任务池随时可改（见 8.3.1），老客户端拿到未知 `taskId` 或未知 `metric` 是必须容忍的正常状态：

- **不得崩溃、不得中断整组候选的展示**——一个候选不认识不能连累另外两个
- 处理方式二选一：**不展示该候选**（该轮退化为二选一），或**展示但标为不可完成**（本地化文案缺失时同样按此处理）
- 无论哪种，都**不判定、不计分、不上报** `dailyTask`
- 记一条客户端日志，便于发现任务池与客户端版本脱节

服务端不需要任何配合：它不认识 metric，也不校验 taskId。

## 5A. 数值标定的数据前置（Phase1 的第一步）

标 target 需要历史分布，但**现在 BigQuery 里几乎没有可用的单局数据**。

### 5A.1 现状

单局数据进 BigQuery 只有一条路：GA4 event → GA4 的 BigQuery 导出。`extensions/` 下的 firestore-bigquery-export 只导出 `Players` 和 `Members` 两个 collection，全是累计值。

`GameEndPlayerDto` 有 17 个字段，但进 GA4 的只有 `points`（battlePoints）和 `awaken`。其余靠 `game_end_match` 的 `buildPlayerJson()` 打包成一个 JSON 字符串，且只含 10 个字段：

```ts
{ hi: heroId, si: steamId, ti: teamId, dc: isDisconnected,
  l: level, g: totalGoldEarned, k: kills, d: deaths, a: assists, p: score }
```

对照 10 个指标：

| 指标 | BigQuery 有历史 |
| --- | :---: |
| `kills` | ✅（`k`） |
| `assists` | ✅（`a`） |
| `total_gold_earned` | ✅（`g`） |
| `last_hits` / `tower_kills` / `hero_damage` / `healing` / `damage_taken` | ❌ |
| `stun_duration` / `roshan_kills` | ❌ |

**10 个里只有 3 个能查历史分位数。**

### 5A.2 GA4 参数限额

GA4 每个 event 上限 25 个参数，每个参数值上限 100 字符。

`game_end_player` 当前 **19 个参数**（16 个显式 + `buildEvent` 追加的 `session_id` / `session_number` / `debug_mode`），剩 6 个空位。7 个缺失指标直接各占一个会到 26，超 1 个。

`buildPlayerJson()` 的输出已约 81 字符，贴近 100 上限，无法再塞字段。

因此用**一个 JSON 参数**打包：

```ts
// analytics.service.ts gameEndPlayerBot()
player_stats: JSON.stringify({
  hd: player.heroDamage,  dt: player.damageTaken,
  he: player.healing,     lh: player.lastHits,
  tk: player.towerKills,  st: player.stuns,
  rk: player.roshanKills,
}),
// {"hd":523456,"dt":412345,"he":123456,"lh":85,"tk":3,"st":45,"rk":1}  ≈ 68 字符
```

`game_end_player` 加入 `player_stats` 后变为 **20 个参数**；后续加入
`point_daily_task` 后为 21 个。BigQuery 侧用 `JSON_VALUE()` 解析。

#1057 标定时，为避免 `kills` / `assists` / `total_gold_earned` 必须通过
`match_id + steam_id` 连接 `game_end_match.player_N`，再增加一个短 JSON 参数：

```ts
player_stats_basic: JSON.stringify({
  g: player.totalGoldEarned,
  k: player.kills,
  a: player.assists,
}),
```

不把这三项直接塞进现有 `player_stats`，避免高表现对局的 JSON 超过 GA4
单参数 100 字符限制。增加后 `game_end_player` 共 **22 个参数**，仍留 3 个余量。

### 5A.2A 赛季积分的拆分维度

`points`（= `battlePoints`）现在只有总额。积分实际由三部分构成（`game-end.ts`）：

```
score + gameTimePoints              = basePoints
basePoints × 难度倍率 × 胜负倍率     = rawBattlePoints
round(raw × 行为分倍率)              = settledPoints
settledPoints + 每日挑战奖励          = battlePoints        ← 实际入账总额
```

#### game 侧必须固定计算顺序

**行为分倍率只作用于对局积分，不作用于每日挑战奖励。**

```ts
const rawBattlePoints = this.CalculatePlayerBattlePoints(playerDto, difficultyMultiplier, winnerTeamId);
const conductMultiplier = this.GetConductMultiplier(conductPoint, isTeamGame);
const settledPoints = Math.max(0, Math.round(rawBattlePoints * conductMultiplier));

playerDto.dailyTask = { taskId, star, seasonPoint: dcPoints };  // 不入账
playerDto.battlePoints = settledPoints + dcPoints;   // 总额，实际入账
```

这是玩法正确性要求，与统计无关：若挑战积分先并入再乘行为分倍率，候选卡上写着「80 分」的奖励会实到 96 或 64，UI 与到手数额不符。

#### GA4 参数

`game_end_player` 增加**一个数值参数**：

| 参数 | 来源 | 说明 |
| --- | --- | --- |
| `point_daily_task` | `player.dailyTask?.seasonPoint ?? 0` | 缺省兜底为 0，理由见下 |

对局积分 = `points - point_daily_task`。

**这个参数必须 `?? 0` 兜底**，与下文针对 `stuns` 的结论相反。字段缺值不是罕见情况：API 先上线的窗口期（见 12.5）旧客户端不发，而**玩家没完成任务的对局同样不发，那才是常态**。若缺值时省略 key，BigQuery 得到 `NULL`，`points - NULL = NULL`，绝大多数行的对局积分算不出来，每张看板都得记得写 `COALESCE`。

判据是「`0` 和『没上报』是不是同一件事」：`point_daily_task` 的 `0` 表示"没拿到任务积分"，而没上报的原因（没完成 / 功能未上线）同样是没拿到任务积分——两者一致，兜底为 0 不引入任何失真。

行为分加成（`settledPoints - rawBattlePoints`）**不做统计**——现有总分维度已够用，不为此增加字段。

参数预算：`player_stats`（#1050 已合并）后为 20，加本参数变 **21 / 25**，剩 4 个。

**用独立参数而非打包 JSON**：这三个要注册成 GA4 自定义指标、直接求和求平均；`player_stats` 那 7 个是一次性标定用的分析数据，打包无妨。

**不新开 event**：这个维度要按英雄/难度/胜负/国家切分，而这些维度全都已经在 `game_end_player` 上。独立 event 需要靠 `session_id` join 才能关联，GA4 界面里做不到，只能退化成 BigQuery SQL。

不够时 `win_metrics`（与 `is_winner` 逐字重复）和 `hero_name_cn`（可从 `hero_name` 推导）是两个可回收的名额。

**语义变更提醒**：每日挑战上线后 `battlePoints` 含挑战积分，`points` 的时间序列会在上线当天跳变。有 `point_daily_task` 可反推纯对局积分，但 BigQuery 看板说明里要标注这个断点。

**`stuns` 相反，不做 `?? 0` 兜底。** 它的 `0` 表示「本局没控到人」，是真实观测值；若把「没上报」也记成 `0`，标定时无法区分两者，那批假零会把分位数整体拉低。字段缺失时 `JSON.stringify` 自动丢弃该 key，BigQuery 得到 `NULL`，标定查询用 `IS NOT NULL` 排除即可。

两个字段结论相反，是因为判据不是"要不要兜底"而是"`0` 和『没上报』是不是同一件事"——`point_daily_task` 是，`stuns` 不是。

（这与 issue #1014 的 `awaken ?? 0` 相反——`awaken` 的 `0` 就是「未觉醒」，缺省按 0 语义正确。）

### 5A.3 `GameEndPlayerDto` 新增字段

| 新字段 | 来源 | 状态 |
| --- | --- | --- |
| `stuns` | `PlayerResource.GetStuns()` | ✅ #1050 已合并 |
| `roshanKills` | `PlayerResource.GetRoshanKills()` | ✅ #1050 已合并 |
| `dailyTask`（含 `seasonPoint`）| `/game/start` 下发的候选奖励 | Phase1 |

其余 5 个缺失指标（`heroDamage` / `damageTaken` / `healing` / `lastHits` / `towerKills`）DTO 里已经有，#1050 已把它们打包进 `player_stats` 参数。

**数据积累从 #1050 上线之日起算**（见 12.1）。

两个新字段声明为 `@IsOptional()`。它们**不参与每日挑战的判定机制**——判定在客户端完成，服务端不看数值；作用是让服务端把它们转发进 GA4，积累标定数据，顺带补上 analytics 的空白。

### 5A.4 上线顺序：无硬依赖，建议 game 先行

`api/src/util/settings.ts` 的 `ValidationPipe` 配置是 `forbidUnknownValues: false`，且未开启 `whitelist` / `forbidNonWhitelisted`：

```ts
new ValidationPipe({ transform: true, forbidUnknownValues: false })
```

未知字段被静默接受，不会返回 400。因此 game 先发送新字段而 API 的 DTO 尚未声明，请求照常通过，字段被忽略——**不存在"game 先上线导致整局结算失败"的风险**。

建议顺序：

1. **game 先上线**——DOTA2 自定义游戏进服强制更新，玩家一进即为新版本，数据立刻开始积累
2. **API 随后上线**——DTO 声明 + analytics 打包，上线即可收到 game 已在发送的字段

反向顺序（API 先）也安全，但要干等 game 发版才有数据，白白浪费积累窗口。

### 5A.5 顺带发现的既有问题（独立于每日挑战）

`game_end_match` 的参数数量随人数线性增长：`6 个基础 + N 个 player_N + 4 个 buildEvent`。

- 5 真人 + 10 bot = 15 名玩家 → 25 个，刚好触顶
- 6 真人 + 10 bot = 16 名玩家 → 26 个，超限
- 10v10 满员 20 名玩家 → 30 个，超限 5 个

超出的参数会被 GA4 静默丢弃，也就是说排在后面的 `player_N` 很可能从未进入 BigQuery。本 spec 不修这个，但建议单独确认。

另注：`game_end_player` 里 `is_winner` 与 `win_metrics` 是逐字重复的两个参数，删掉其一可以腾出一个空位——需先确认没有现存看板依赖。

## 6. 数据模型

每日挑战**只新增一个 collection**。赛季积分仍写入既有的 `Players` collection，且不新增写入点（见 7.2）。

```ts
// api/src/daily-task/entities/player-daily-task.entity.ts
@Collection()
export class PlayerDailyTask {   // → 集合名 PlayerDailyTasks
  @Exclude()
  id: string;                 // = steamId.toString()
  steamId: number;
  dayId: string;              // 'YYYYMMDD'，读到时若 !== 今天则触发跨天重置

  completedTasks: CompletedTask[] = [];   // 今天已完成，0~3，顺序即轮次
  todaySeasonPoint: number;               // 今日累计，跨天时汇总进 history
  history: DailyTaskHistoryEntry[] = [];  // 最近 30 天，最新在前

  updatedAt: Date;
}

export interface CompletedTask {
  taskId: string;
  star: number;         // 1~3，响应时结合当前任务定义展开为完整 TaskCandidateDto
}

export interface DailyTaskHistoryEntry {
  dayId: string;
  tasks: CompletedTask[];  // 当天完成的任务，轮数 = length
  seasonPoint: number;     // 当天获得赛季积分
}
```

五个业务字段。文档数固定等于玩家数，永不增长。

Firestore 中的 `completedTasks` / `history[].tasks` 仍只保存 `{ taskId, star }`。`/game/start` 组装响应时按 `taskId` 查找当前任务定义，展开为含 `scope` / `metric` / `heroName` / `target` / `rewardSeasonPoint` 的完整 `TaskCandidateDto`；任务池中已不存在的旧 taskId 从响应数组过滤，但不影响独立保存的积分汇总。

**写法对齐仓库现状**：仓库里 14 个 entity 全部使用裸 `@Collection()`，集合名由 fireorm 按 `pluralize.plural(类名)` 推导（`Player → Players`、`PlayerHeroAwakening → PlayerHeroAwakenings`）。`id` 上的 `@Exclude()` 与数组字段的 `= []` 默认值同样沿用 [player-hero-awakening.entity.ts](../../api/src/player-hero-awakening/entities/player-hero-awakening.entity.ts) 的写法。

**`dayId` 对齐现有日界口径**：格式 `YYYYMMDD`、**UTC** 日界，与 `PlayerRanking.id`（`new Date().toISOString().slice(0, 10).replace(/-/g, '')`）和会员签到（`setUTCHours(0, 0, 0, 0)`）一致。原 PR 的 `ChallengeDayClockService` 用的是服务器本地时区（`setHours()` / `getFullYear()`）加 `YYYY-MM-DD`，两个维度都与仓库现状不符——Cloud Functions 默认 UTC 所以当前表现一致，但那是隐式依赖，运行时时区一变日界就漂。

**`taskId` 结构**（沿用现有任务池）：通用任务 `general_<metric>`，英雄任务 `hero_<hero>_<1|2|3>`——后缀是该英雄的第几条任务，**不是星级**。星级正交，因此必须单独存 `star`，否则历史面板无法还原当时的目标值与奖励。

### 6.1 幂等是免费的

不需要 `processedMatchIds`：**taskId 就是幂等键**。生成候选时会排除当天已完成的 taskId（见 8.1），因此同一个 taskId 在一天内最多被完成一次；重复上报时它已经在 `completedTasks` 里，直接忽略。

去重必须做在 **task 级而非 (task, star) 级**——1★ 完成过的任务，3★ 的同一任务也不应再出现，否则玩家一天三轮打的是同一件事。这也是 `star` 要单独成字段、不拼进 taskId 的原因：拼成 `general_kills_2` 之后，服务端得反解字符串才能按 task 去重。

而赛季积分不在服务端加，所以 `/game/end` 重放也不会重复发分——重放会重复累加 `battlePoints`，但那是既有缺陷（见 9.2），不是本设计引入的。

### 6.2 候选不落库

候选由 `(dayId, steamId, round)` 加当天已完成的 taskId 列表确定性生成——taskId、星级、目标、奖励全部可算出。因此不存 `candidates`、不存 `target`。

**这条的正确性完全押在"同样的输入必须算出同样的结果"上**：玩家没完成任务时，连续多局的 `round` 与已完成列表都不变，每次 `/game/start` 都要重新算出逐字段相同的候选，否则玩家会看到候选在眼前跳变。第 11 节为此单列了一条 e2e。

已完成任务的 `star` 是唯一的例外：它在候选被完成之后才有保留价值（历史面板要还原当时的目标与奖励），而重算它会重新引入"任务池不得修改"的运维约束，正是 8.3.1 刚去掉的那条。存一个整数比留一条约束便宜。

生成只发生在 `/game/start`。`/game/end` **不重算、不验证**（见 8.3.1），上报什么就记什么，奖励值由客户端一并发来。

**因此不存在任务池的运维约束。** 早期设计要求"已上线任务的 `id` 与 `metric` 不得修改、只在挑战日边界部署"，那是为了让 `/game/end` 的重算与当初下发的候选一致。取消重算后这条约束一并消失——任务池可以随时改，最坏情况是玩家已看到的候选在下次 `/game/start` 变了，属于 UX 抖动而非数据错误。`configVersion` 因此彻底没有存在必要。

### 6.3 全部派生、不落库的值

`totalRounds`（常量 3）、`currentRound` = `completedTasks.length + 1`、`completedRoundCount` = `completedTasks.length`、`needsSelection` = `completedTasks.length < 3`、`history[].rounds` = `history[].tasks.length`、`startsAt` / `endsAt`（从 `dayId` 算）、`candidates` 及其 `target` / `rewardSeasonPoint`。

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

响应新增（沿用现有 `dailyTasks` 数组字段名，结构简化）：

```json
{
  "dailyTasks": [
    {
      "steamId": 483215844,
      "dayId": "20260811",
      "candidates": [
        {
          "taskId": "general_hero_damage",
          "scope": "personal_general",
          "metric": "hero_damage",
          "star": 2,
          "target": 500000,
          "rewardSeasonPoint": 80
        },
        {
          "taskId": "general_stun_duration",
          "scope": "personal_general",
          "metric": "stun_duration",
          "star": 1,
          "target": 34,
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
      "completedTasks": [
        {
          "taskId": "general_kills",
          "scope": "personal_general",
          "metric": "kills",
          "star": 1,
          "target": 60,
          "rewardSeasonPoint": 60
        }
      ],
      "todaySeasonPoint": 60,
      "history": [
        {
          "dayId": "20260810",
          "tasks": [
            {
              "taskId": "general_last_hits",
              "scope": "personal_general",
              "metric": "last_hits",
              "star": 3,
              "target": 200,
              "rewardSeasonPoint": 100
            },
            {
              "taskId": "hero_lina_2",
              "scope": "personal_hero",
              "metric": "stun_duration",
              "heroName": "npc_dota_hero_lina",
              "star": 2,
              "target": 105,
              "rewardSeasonPoint": 80
            },
            {
              "taskId": "general_healing",
              "scope": "personal_general",
              "metric": "healing",
              "star": 1,
              "target": 300000,
              "rewardSeasonPoint": 60
            }
          ],
          "seasonPoint": 240
        }
      ]
    }
  ]
}
```

三轮全部完成时 `candidates` 为空数组（服务端直接短路，不调用生成器，见 8.2）。`totalRounds` 是常量、`currentRound` 可由 `completedTasks.length + 1` 派生，客户端不需要，因此响应不下发这两个字段。没有 `schemaVersion`、没有 `unit`、没有 `assignmentId`、没有 `progress`。

`dayId` 由客户端保存，`/game/end` 时原样回传。

每日挑战异常只记 `logger.warn`，不阻断开局响应——沿用现有做法。

### 7.2 `POST /game/end`

请求：`GameEndPlayerDto` 新增**一个可选的嵌套对象**（`stuns` / `roshanKills` 已随 #1050 合并），`GameEndDto` 顶层不新增每日任务字段。

任务积分由客户端**计入 `battlePoints` 总额**，且必须加在行为分倍率之后（见 5A.2A）。`dailyTask.seasonPoint` 本身不参与入账，只用于服务端记录统计数字与 GA4 拆分维度。

```ts
export class DailyTaskResultDto {
  /** 本局归属的任务日，取自 /game/start 响应 */
  @ApiProperty()
  @IsString()
  @Matches(/^\d{8}$/)
  dayId: string;

  /** 本局完成的每日任务 */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  taskId: string;

  /** 该候选的星级 1~3 */
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(3)
  star: number;

  /** 该任务的奖励值，取自 /game/start 下发的候选 */
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  seasonPoint: number;
}

export class GameEndPlayerDto {
  // ... 现有字段不变，battlePoints 已含每日任务奖励
  /** 未完成任务时整个对象不发送；发送则四个字段必须齐全 */
  @ApiProperty({ type: DailyTaskResultDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => DailyTaskResultDto)
  dailyTask?: DailyTaskResultDto;
}

```

#### 为什么用嵌套 DTO 而不是四个扁平可选字段

"四个字段要么全发、要么全不发"是一条真实约束。写成四个 `@IsOptional()` 的扁平字段时它只是注释，写成嵌套对象则由 `@ValidateNested()` 强制执行——**外层可选，内层必选**，正好表达这个语义。仓库已有先例：`GameEndDto.gameOptions` 就是嵌套 DTO。

顺带消掉了字段名里的手动前缀：`dailyTask.taskId` 而不是 `dailyTaskTaskId`，嵌套本身就是命名空间（见 10.1）。

**代价是校验失败会 400，而 400 会打掉整局所有玩家的结算**，与第 9 节"每日任务永不阻断结算"的原则相冲突。仍然选嵌套，因为：

- 风险是理论上的——客户端这个对象只可能整体来自 `/game/start` 下发的候选，构造上产生不出"有 taskId 没 star"的中间态
- 扁平可选的失败模式更糟：校验通过，服务端把 `star: undefined` 静默写进 Firestore，没有任何信号
- 400 是响的，DOTA2 强制更新，坏版本几分钟内暴露

**同时保留 8.3 的存在性检查**（四个字段齐全才记录，否则 `logger.warn` 跳过）。两者防的不是同一件事：校验防畸形请求，运行时检查防"校验被绕过时写进半条记录"。

**注意别照抄 `gameOptions` 的写法**：它只有 `@Type()` 没有 `@ValidateNested()`，内层字段也没有任何校验器，等于纯结构嵌套、不做校验。这里要显式加 `@ValidateNested()`。

`dayId` 放进 `dailyTask`：它离开每日任务没有独立意义，服务端的准入条件也要求 `dailyTask` 存在且 `dailyTask.dayId` 非空。嵌套对象本身就是命名空间，因此不再保留 `dailyTask` 前缀。

`star` 与 `seasonPoint` 由客户端发来而非服务端重算，是 8.3.1 的直接结果：服务端要往 `completedTasks` / `todaySeasonPoint` 里记两个数，而客户端已经知道它们（都是 `/game/start` 下发的），重算一遍没有意义。`seasonPoint` 记的是**实际入账数额**而非由 `star` 查表得出，这样奖励表将来调整不会让历史记录的分数跟着变。

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

上限值保持 500 不变。正常对局的 `battlePoints` 顶多 200 出头，加上 3★ 任务的 100 仍远低于 500，**cap 在正常玩法下不会触发**——它的作用是防御客户端异常，而不是约束正常收益。

改为 cap 的意义因此是：既保住了异常防御和 `logger.warn` 信号，又不会在任何情况下因为超限把玩家的基础结算整个丢掉。

## 8. 服务端逻辑

### 8.1 候选生成

```ts
generateCandidates(
  dayId: string,
  steamId: number,
  round: number,
  completedTaskIds: string[],   // 当天已完成，从池中排除
): TaskCandidate[]
```

seed = `${dayId}:${steamId}:${round}`，FNV-1a 哈希取模，从排序后的任务池中抽取：

1. **先从两个池中剔除 `completedTaskIds`**
2. 抽 1 个通用任务
3. 抽 1 个英雄任务
4. 第 3 个候选按 seed 决定抽通用还是英雄（各 50%）：抽通用时排除步骤 2 已抽的 `taskId`，抽英雄时**排除步骤 3 的 `heroName`**——两个英雄候选必须指向不同英雄，否则这一轮等于只有一个英雄可选
5. 把 `[1, 2, 3]` 三个星级按 seed 洗牌后依次分配给上面三个候选（6 种排列，见 3.3）

**为什么是"各保底 1 个 + 第 3 个随机"**：

- **保底 1 个通用**——不愿换英雄的玩家每轮永远有一个可做的任务，不会被逼到只剩英雄任务
- **保底 1 个英雄**——内容量全在英雄侧（307 条 vs 十几条通用），每轮至少露出一条
- **第 3 个随机**——两种构成（2 通用 1 英雄 / 1 通用 2 英雄）各半，保留变化

通用池的抽取次数因此是每天 3~6 次、期望 4.5 次，落在 10 条池子加轮间去重能承受的范围内，12.2 不需要为同一 metric 再配多个难度档。

代价是难度三选一（3.3）对不换英雄的玩家会打折：第 3 槽位抽到英雄时，他实际只有 1 个通用候选可选，星级由 seed 决定。这是构成比例的固有取舍，两个保底数都只是常量，上线后看完成率可调。

**未完成时候选不变，不是"沿用上一次"，而是重新算出同一个结果。** `round = completedTasks.length + 1`，没完成就不变，`completedTaskIds` 也不变，于是整个生成的输入完全相同——这正是候选不落库能成立的原因。

**当天已完成的任务不再出现在后续轮次的候选里。** 这是 taskId 能当幂等键的前提——否则第 2 轮可能抽回第 1 轮已完成的任务，玩家打完之后服务端按幂等忽略，这一轮白打而客户端的分已经加进 `battlePoints` 了，两边对不上。通用池只有十几条、一天要抽 6 个通用候选，撞车概率并不低。

排除按 **taskId** 而非 `(taskId, star)`：1★ 完成过的任务，3★ 的同一任务也不该再出现。

**未完成**的候选不排除——同一个任务可以在后续轮次再次出现，这与 3.1 "未完成时候选不变，玩家下一局可以改选同一组里的另一个"是一致的。

因此生成不再是 seed 的纯函数，而依赖当天的完成列表。这不影响确定性（完成列表已落库、可复现），也不影响任何调用方：取消 `/game/end` 重算后（见 8.3.1），生成只发生在 `/game/start`，而那里本来就已经把文档读出来了。

### 8.2 `/game/start` 流程

对每个 steamId：

```
读文档（不存在 → 视为新玩家，dayId = ''）
if (文档.dayId !== today):
    if (completedTasks 非空):
        history.unshift({ dayId: 文档.dayId, tasks: completedTasks, seasonPoint: todaySeasonPoint })
        history 裁到 30 条
    dayId = today
    completedTasks = []
    todaySeasonPoint = 0
    写回
if (completedTasks.length >= 3):
    candidates = []                                   // 当天已打满，不调用生成器
else:
    candidates = generateCandidates(dayId, steamId, completedTasks.length + 1, 已完成 taskId)
返回快照
```

**三轮打满后直接短路，不调用生成器**——这是正确性守卫而非优化。`round = completedTasks.length + 1` 此时是 4，而根本没有第 4 轮；生成器不认识这个边界，会照样按 seed 算出一组候选，那是必须不能下发的垃圾。同理，去重后的池子在这时也已经少了 3 条，没有意义再抽。

当天没有任何完成记录时不写 history 条目——`history` 只记录有完成的天。Phase2 数连续天数时靠 `dayId` 连续性判断，不依赖空条目占位。

#### history 的插入与淘汰

```ts
const HISTORY_MAX_ENTRIES = 30;

history.unshift(entry);              // 最新在前，插到 index 0
history.length = HISTORY_MAX_ENTRIES;  // 超长时截断尾部，淘汰最旧的
```

三点容易读错的语义：

- **30 条不是"最近 30 天"，是最近 30 个「有完成的天」。** 没玩或一轮没完成的日子不占位，所以 30 条可能横跨几个月
- **只有跨天重置这一条路径会写 history**，因此只有这里需要截断。没有任何路径会修改已存在的条目——`history` 是只增不改的
- 顺序恒为 `dayId` 降序。插入时不需要排序——新条目的 `dayId` 必然大于 `history[0]`

文档大小无需担心：30 条 × 最多 3 个 task × `{ taskId, star }` 约 6KB，远低于 Firestore 单文档 1MB 上限。

新玩家在第一次 `/game/start` 时懒创建，不需要任何初始化数据投放。

### 8.3 `/game/end` 流程

对每个满足条件的玩家（`steamId > 0`、`!isDisconnected`、`dailyTask` 存在、`dailyTask.dayId` 非空）跑一个事务：

```
读文档
if (dailyTask.dayId !== 文档.dayId): 丢弃并 logger.warn     // 日期不匹配，见下
if (taskId 已在 completedTasks 里): 直接返回              // 幂等
if (completedTasks.length >= 3): 丢弃并 logger.warn
completedTasks.push({ taskId, star })
todaySeasonPoint += dailyTask.seasonPoint
写回
```

**服务端不重算候选、不验证 taskId、不验证指标数值、不发放积分。** 它在 `/game/end` 上是一个纯记录器。

### 8.3.1 为什么去掉候选重算验证

早期设计在这里重算 `generateCandidates(dayId, steamId, round)`，再断言上报的 `taskId` 在候选里。这一步被整个移除，原因有二：

1. **与信任前提自相矛盾。** 全套设计建立在"`/game/end` 经 `x-api-key` 校验、数据可信"之上——达标判定、指标数值、积分计算全部交给客户端。唯独在 taskId 上做防伪造校验，防的是一个已经被授予了远大得多权限的对象，纯属多余。
2. **它唯一的实际产出（`rewardSeasonPoint`）由客户端一起发过来即可。** 服务端记 `todaySeasonPoint` / `history[].seasonPoint` 只是为了给 UI 展示统计数字，客户端本来就知道这个值（它是 `/game/start` 下发的）。

移除后 `generateCandidates()` 只在 `/game/start` 调用。

**连带解除一条运维约束**：6.2 原先要求"已上线任务的 `id` 与 `metric` 不得修改、任务池只在挑战日边界部署"，那是为了让 `/game/end` 能重算出与当初下发一致的候选。不再重算后，任务池可以随时改——最坏情况是玩家已看到的候选在下次 `/game/start` 变了，属于 UX 抖动而非数据错误。

客户端 bug 导致的加分与轮次记录不一致，属于客户端的责任范围，API 不做兜底校验。

### 8.3.2 其他

#### 跨天完成的归属：看 `dailyTask.dayId`，不看到达时刻

**任务日归属由客户端回传的 `dailyTask.dayId` 决定**，它来自 `/game/start` 的响应。因此一局跨过午夜不影响归属。

跨过午夜的一局**不需要任何特殊处理**：

```
day1 23:50  /game/start  → 下发 dayId = day1，客户端保存
day2 00:30  /game/end    → 回传 dailyTask.dayId = day1
                           文档.dayId 此时仍是 day1 —— 跨天重置只发生在 /game/start，
                           而这一局进行期间玩家开不了新局
                        → dayId 匹配，正常记进 completedTasks
day2 再开局  /game/start  → 文档.dayId(day1) ≠ today(day2)，触发跨天重置，
                           day1 的 completedTasks 整体挪进 history[0]，day2 从第 1 轮开始
```

那次跨午夜的完成算进 **day1** 的额度，day2 仍有完整的 3 轮。玩家在 day1 深夜打满第 3 轮、day2 又是全新 3 轮，是正常行为而非漏洞——他确实在两个任务日各玩了一局。

#### 为什么没有"回写昨天"的分支

早期设计里还有一条 `dailyTask.dayId === history[0].dayId → 回写 history[0]` 的分支，用于 `/game/end` 迟到到玩家已开下一局之后的情况。**这条分支不可达，已删除**：

- `/game/end` 走 `ApiClient.sendWithRetry`，`RETRY_TIMES = 3`、`TIMEOUT_SECONDS = 10`，**最大迟到 30 秒**，之后彻底放弃（不落盘、不再重试）
- 30 秒远不够走完结算画面 → 退出 → 重新排队 → loading，下一局的 `/game/start` 不可能挤进来
- 即便真的发生，玩家在旧局的结算数据里会是 `isDisconnected`，8.3 的准入条件本来就跳过

因此 `/game/end` 只有两种结果：`dayId` 匹配则记录，不匹配则丢弃 + `logger.warn`。那条 warn 就是安全网——它若真在生产环境出现，说明上面某条前提不成立，届时再决定怎么补。

连带的简化：**`history` 成为只增不改的结构**（跨天时 unshift 一条、超长截尾），没有任何路径会修改已存在的条目。

**每个玩家独立事务，独立 try/catch。** 现有实现里任何一个玩家抛异常会中断整局结算并留下半写状态，Phase1 必须逐人隔离。

## 9. 错误处理

### 9.1 失败路径

| 情况 | 行为 |
| --- | --- |
| `/game/start` 每日挑战失败 | `logger.warn`，响应里省略 `dailyTasks`，不阻断开局 |
| `/game/end` 单个玩家失败 | `logger.warn`，跳过该玩家，其余玩家继续 |
| 当天已完成 3 轮 | 丢弃 + `logger.warn` |
| `dailyTask.dayId` 与文档 `dayId` 不符 | 丢弃 + `logger.warn` |
| 同一 taskId 重复上报 | 幂等忽略 |
| `battlePoints` 超过 500 | cap 到 500 + `logger.warn` |

没有任何情况会 `throw` 到 `/game/end` 之外。

**"丢弃"的范围仅限每日任务的记账。** 每日任务是逐人独立事务（见 8.3.2），与 `upsertGameEnd()` 的基础结算是两条独立路径——丢弃一条任务记录既不回滚该玩家的 `battlePoints`（客户端加的分照常入账），也不影响同局其他玩家。

### 9.2 继承的既有缺陷

`/game/end` 本身没有幂等保护：重试会重复累加 `seasonPointTotal`、重复 `matchCount++`。每日挑战积分并入 `battlePoints` 后金额变大，但性质不变。

**本 spec 不修这个**，因为它属于基础结算而非每日挑战。若要修，方向是在 `Players` 上记 `lastSettledMatchId`，属于独立决策。

## 10. 模块结构

```
api/src/daily-task/
├── config/
│   ├── tasks.ts                           # 任务池 + 数值配置
│   └── tasks.spec.ts                      # 配置守卫测试
├── entities/
│   └── player-daily-task.entity.ts
├── dto/
│   └── daily-task-snapshot.dto.ts
├── services/
│   ├── daily-task-generation.service.ts   # 确定性候选生成
│   ├── daily-task.service.ts              # 开局快照 + 轮次记录
│   └── daily-task.store.ts                # Firestore 读写
├── types/
│   └── daily-task.types.ts                # TaskScope / TaskMetric enum
└── daily-task.module.ts
```

### 10.1 命名：统一用 `task`，不用 `challenge`

原实现两个词混用——`challenge` 指系统、`task` 指任务池条目，于是 `ChallengeMetric` 和 `taskId` 并存，每加一个标识符都要先判断它落在哪一层。**Phase1 只保留 `task` 一个词。**

`task` 本来就是这套东西的主导词汇（`config/tasks.ts`、任务池、`taskId`、`completedTasks`），消掉 `challenge` 之后不需要任何规则——规则再清晰也是要记的，不存在的规则才是零成本。

| 原名 | 改名 |
| --- | --- |
| `PlayerDailyChallenge` / 集合 `PlayerDailyChallenges` | `PlayerDailyTask` / `PlayerDailyTasks` |
| `DailyChallengeHistoryEntry` | `DailyTaskHistoryEntry` |
| `ChallengeMetric` / `ChallengeScope` | `TaskMetric` / `TaskScope` |
| `Candidate` | `TaskCandidate` |
| `dailyChallengeTaskId` / `…Star` / `…SeasonPoint` | 合并为嵌套对象 `dailyTask: { taskId, star, seasonPoint }`（见 7.2）|
| `dailyChallengeDayId` | `dailyTask.dayId`（嵌套在 `dailyTask`）|
| `/game/start` 响应 `dailyChallenges` | `dailyTasks` |
| GA4 参数 `point_daily_challenge` | `point_daily_task` |

`PlayerDailyTask` 单数装 `completedTasks[]`，与仓库现有的 `PlayerHeroAwakening` 装 `awakenings[]` 是同一个模式。

模块内部类型不带 `dailyTask` 前缀——`daily-task/types/` 这个路径已经给了上下文；只有挂在 `GameEndPlayerDto` 上的字段需要前缀做命名空间，因为它们与 `heroDamage`、`towerKills` 这些无关字段并排。

**game 侧必须同一批改名。** 否则等于把模块内的用词分裂换成跨仓库、正好落在 API 边界上的分裂——那是更糟的一种。成本不高：13.3 本来就要删掉 8 个采集模块，剩下要改的只有 controller 与 DTO。

**界面显示名不受影响。**「每日挑战」是展示文案，与标识符是两回事；要不要顺势改成「每日任务」是独立的产品决定。

GA4 的 `point_daily_task` 现在改是免费的——自定义维度还没注册，一旦注册并开始有数据，改名就要同时动看板和历史查询。

### 10.2 `config/tasks.ts` 的最终结构

任务**内容**的重新设计是独立工作项（见 12.2），但**结构**在本 spec 内定死：

```ts
// api/src/daily-task/config/tasks.ts
import { TaskMetric, TaskScope } from '../types/daily-task.types';

export interface TaskDefinition {
  /** general_<metric> | hero_<hero>_<1|2|3> */
  id: string;
  scope: TaskScope;
  metric: TaskMetric;
  /** 1★ 基准值；2★ / 3★ 由 3.3 的加法/乘法双档推导，不落库、不写进配置 */
  target: number;
  /** 仅 PERSONAL_HERO 有 */
  heroName?: string;
}

export const ROUNDS_PER_DAY = 3;
export const STAR_REWARDS = { 1: 60, 2: 80, 3: 100 } as const;
export const STAR_TARGET_MULTIPLIERS = { 1: 1, 2: 1.5, 3: 2 } as const;
export const SMALL_TARGET_THRESHOLD = 10;

export const DAILY_TASKS: TaskDefinition[] = [
  // 通用任务：一个 metric 至少一条，id 为 general_<metric>
  { id: 'general_kills', scope: TaskScope.PERSONAL_GENERAL, metric: TaskMetric.KILLS, target: 60 },
  // ...
  // 英雄任务：127 英雄 × N 条，id 为 hero_<hero>_<序号>
  {
    id: 'hero_lina_1',
    scope: TaskScope.PERSONAL_HERO,
    metric: TaskMetric.HERO_DAMAGE,
    target: 550000,
    heroName: 'npc_dota_hero_lina',
  },
];
```

**条目形状不变**——现有的 `{ id, scope, metric, target, heroName? }` 已经是最小集，五个字段每个都在用。

**拆掉底部的 `DailyChallengeConfigSnapshot` 包装对象**，改为模块级 `const`。两个原因：仓库规范首选模块级 `SCREAMING_SNAKE_CASE` 常量；而那个包装对象存在的理由是配合 `configVersion` 做整体快照，`configVersion` 在 6.2 已经删了。

包装对象里的字段处置：

| 字段 | 处置 |
| --- | --- |
| `personalRoundsPerDay: 3` | → `ROUNDS_PER_DAY` |
| `personalStarRewards: {1:80, 2:100, 3:120}` | → `STAR_REWARDS`，数值改为 **60 / 80 / 100** |
| `personalDefaultStarMultipliers` | → `STAR_TARGET_MULTIPLIERS`，另加 `SMALL_TARGET_THRESHOLD`（见 3.3）|
| `personalStarWeights: {1:1,2:1,3:1}` | **删除**——星级改为每轮 1/2/3 各一个的固定分配，没有权重可言（见 3.3）|
| `globalRewardTiers` | 删除（Phase3）|
| `refreshCostsMemberPoint` | 删除（付费刷新整个删）|
| `streakMilestones` | 删除（Phase2）|

**metric 命名去掉单位后缀**：`SLOW_DURATION_MS` 这类 `_MS` 结尾的 metric 随 5.2 一起删除，保留的 `STUN_DURATION` 单位是**秒**，不带后缀。单位由 metric 在客户端映射到文案，不进配置。

配置守卫测试（`tasks.spec.ts`）断言：id 唯一、`PERSONAL_HERO` 必带 `heroName`、`PERSONAL_GENERAL` 必不带、`target` 为正整数、`metric` 在 enum 内、同一英雄的多条任务 metric 不重复。

`ChallengeDayClockService` **不保留**。去掉 `closesAt` 和 120 分钟宽限（那是共同任务封口用的）之后，它只剩一个日期格式化函数，而这个函数与 `PlayerRankingService.getDateString()` 完全重复。做法是把那个私有方法提成共享工具，两边都用，日界口径也就天然一致了。

现有 11599 行（含 2837 行任务池和全部测试）预计降到约 350 行实现 + 任务池 + 测试。

## 11. 测试策略

**Unit**

- 生成器：同一 `(dayId, steamId, round, completedTaskIds)` 结果稳定；不同 round 结果不同；必含 ≥1 通用且 ≥1 英雄；出现两个英雄时 `heroName` 不同、出现两个通用时 `taskId` 不同；多个 seed 下第 3 槽位两种类型都出现得到
- 星级分配：每轮三个候选的星级恰为 `{1, 2, 3}` 的一个排列——不重复、不缺失；多个 seed 下六种排列都出现得到
- 生成器去重：传入 `completedTaskIds` 后，候选里不含其中任何一个；同一 taskId 不因星级不同而漏掉；未完成的 taskId 不受影响
- 打满短路：`completedTasks.length >= 3` 时 `candidates` 为空且**生成器未被调用**（用 spy 断言），不依赖生成器自己处理 round=4
- 星级目标：小整数走加法档、大数值走乘法档，两条路径下 1★/2★/3★ 都严格递增（见 3.3）
- 跨天重置：`dayId` 变化时把 `completedTasks` 整体挪进 history、当日字段清空；当天无完成时不写 history 条目
- history 插入淘汰：新条目进 index 0；已有 30 条时插入后仍为 30 条且淘汰的是**最旧**的那条；`dayId` 保持降序
- 轮次记录：已完成 3 轮时丢弃；`completedTasks` 记下 `star`；`todaySeasonPoint` 累加客户端上报的奖励值
- 掉线玩家：`isDisconnected` 为真时，即使带了完整的 `dailyTask` 也不写 `completedTasks`、不累加 `todaySeasonPoint`（见 3.5）
- 幂等：同一 taskId 重复上报不重复计数、不重复加 `todaySeasonPoint`
- `dayId` 不符：上报的 `dailyTask.dayId` 与文档 `dayId` 不同时丢弃并 warn，不写任何字段
- `battlePoints` cap：超限截断到 500 且不丢弃该玩家结算
- 配置守卫：任务池 id 唯一、英雄任务必带 `heroName`、通用任务不带、`target` 为正整数、`metric` 在 enum 内

**E2E**（`api/test/daily-task.e2e-spec.ts`）

- 完整一天：开局 → 上报完成第 1 轮 → 再开局拿到第 2 轮候选 → 完成 → 第 3 轮 → 三轮完成后 `candidates` 为空
- **未完成时候选稳定**：连续调用 `/game/start` 多次、中间不上报任何完成，每次返回的 `candidates` **逐字段相同**——`taskId`、`star`、`target`、`rewardSeasonPoint` 与顺序都一致。这条直接验证 6.2「候选不落库」成立：候选是每次重新算出来的，不是存下来的快照，所以必须算得出同一个结果
- 轮间去重：第 2、3 轮的候选里不出现前面已完成的 taskId
- 跨天：第 1 天完成 2 轮 → 第 2 天开局，history 出现第 1 天条目（含 `tasks` 明细）、当日字段清空
- 旧客户端兼容：不带任何 `dailyTask*` 字段的 `/game/end`，既不创建也不修改文档（见 12.5）
- 跨午夜的一局：第 1 天开局拿到候选，不再开局、直接在第 2 天上报 `dailyTask.dayId = 第 1 天`，应记进**当天**桶（此时文档 `dayId` 仍是第 1 天）；随后第 2 天开局才触发重置，且第 2 天仍有完整 3 轮
- `dayId` 不符：第 2 天已开局（已重置）后才上报 `dailyTask.dayId = 第 1 天`，该玩家的任务记录被丢弃，但其 `battlePoints` 结算与同局其他玩家均不受影响
- `/game/end` 重试：同一 taskId 调两次，`completedTasks` 不重复
- 一个玩家数据异常不影响同局其他玩家结算
- 掉线玩家：同一局里一个 `isDisconnected` 玩家带完整 `dailyTask`、一个正常玩家也带——只有正常玩家被记录，掉线玩家的文档不产生任何变化
- `battlePoints = 580` 时玩家仍完成基础结算，`seasonPointTotal` 只 +500

各用例使用独立 steamId（遵循仓库 e2e 规范）。

## 12. Phase1 的工作分解

**任务池与机制都不依赖数据积累**，可以立刻并行开工；只有最后的数值标定要等数据。

| 工作项 | 依赖 | 状态 |
| --- | --- | --- |
| 12.1 补 GA4 统计并积累数据 | — | ✅ #1050 已合并，数据在攒 |
| 12.2 任务池重新设计 | 无 | 可开工 |
| 12.3 机制实现 | 无 | 可开工 |
| 12.4 数值标定 | 12.1 的数据 + 12.2 的任务池 | 最后做 |
| 12.5 上线（API 先，game 后） | 全部 | — |

早期设计里这是一条硬顺序（先攒数据 → 再设计任务池 → 最后实现机制），因为任务池的 `target` 要按分位数标定。**把 `target` 拆成"先占位、最后统一调"之后依赖链断开了**：12.2 只决定"哪个英雄配哪个指标、配几条"，这与数据无关。

### 12.1 补 GA4 统计并积累数据

见第 5A 节。10 个指标里只有 3 个在 BigQuery 有历史。**windy10v10ai/firebase#1050 已合并**——`stuns` / `roshanKills` 两个字段与 `player_stats` 打包参数已上线，数据从上线之日起开始积累。

`GetStuns()` 的口径实机验证亦已完成，结论见 5.2。

这一项现在只阻塞 12.4，不阻塞任何其他工作。攒多久取决于日活，判断标准是**冷门英雄的样本量**：英雄专属任务按英雄标定分位数，样本要按英雄切分，127 个英雄里最冷门的那批是瓶颈。

**样本范围：`WHERE difficulty BETWEEN 1 AND 8`**，与 3.5 的启用条件完全一致——自定义模式的对局不启用每日任务，其指标分布也不该进入标定。`difficulty` 是 `game_end_player` 的现有参数，不需要额外改动。

dota(1~5) 与 hard(6~8) **合并标定，不分层**（见 3.5）：1~8 共用同一套任务与同一套 target。这也意味着冷门英雄的样本量按合并后计算，比分层时更容易凑够。

### 12.2 任务池重新设计（独立工作项，本 spec 不覆盖）

404 条任务里有 204 条用了被删除的指标。但在"**每个英雄 1~3 条都可以**"的前提下，**需要人工指定指标的英雄是 0 个**——全部可机械生成。

机械替换规则：

| 规则 | 影响 |
| --- | --- |
| `magical` / `physical` / `pure_damage` → `hero_damage` | 150 条 |
| `root_duration` → `stun_duration` | 8 条（`GetStuns()` 把缠绕时长一并计入，已实机验证，见 5.2）|
| `bot_kills` → `kills` | 4 条（见 5.3）|
| `slow` / `silence` / `taunt` / `break` / `debuff` | 46 条，**直接丢弃**，不找替代 |
| `roshan_kills` 退出英雄任务 | 2 条，直接丢弃 |
| 同一英雄内替换后指标重复 | 保留一条，其余丢弃 |

跑完之后每个英雄剩下的可用条数：

| 可用条数 | 英雄数 |
| ---: | ---: |
| 3 条 | 65 |
| 2 条 | 50 |
| 1 条 | 12 |
| **0 条** | **0** |

**没有一个英雄归零**，所以不需要任何人工填补。早期版本算出的"74 条需人工指定"完全是"每英雄必须 3 条且指标不重复"这条约束逼出来的；放宽到**每英雄 1~3 条都可以**之后它自动消失。

#### 每英雄保留几条：全留

不设上限，机械替换与去重后剩几条就是几条（1~3 条），**共 307 条英雄任务**。指标分布：

| 指标 | 条数 | 占比 |
| --- | ---: | ---: |
| `hero_damage` | 124 | 40% |
| `stun_duration` | 72 | 23% |
| `healing` | 50 | 16% |
| `damage_taken` | 25 | 8% |
| `assists` | 22 | 7% |
| `kills` | 8 | 3% |
| `tower_kills` | 6 | 2% |

`hero_damage` 是三种伤害类型的汇聚点，占到四成。可以通过"三条并存时优先丢掉 `hero_damage`"把它压到 25%，但那要牺牲任务总量（307 → 242 条）。**选择全留**——每轮 2 个英雄候选、307 条池子，重复率本来就低，多样性靠池子大小而非分布均匀度来保证。

#### 约束

1. **`roshan_kills` 只做通用任务，不做英雄专属。** 单局肉山击杀归属唯一，做成英雄任务时能否完成基本靠运气而非英雄操作。
2. **同一英雄内不出现重复指标。** 替换后撞车的直接丢弃，不找替代——这是放宽到"1~3 条都可以"带来的简化。
3. **小整数指标的三档由 3.3 的加法规则保证互不相同**，任务池不需要为此调整 target。

#### 差异化的降级要接受

原本靠「魔法/物理/纯粹伤害 + 六种控制」表达英雄定位，现在莉娜与幽鬼的任务都会是 `hero_damage`，只有数值不同。

损失比看上去小：`stun_duration`（30%）覆盖控制型英雄，`healing`（21%）覆盖辅助，`damage_taken`（10%）覆盖坦克。剩下的靠 `heroName` 限定加数值高低区分。

#### 该工作项还需一并决定

- **通用任务的数量**：原 19 条一一对应 19 个 metric（id 即 `general_<metric>`），现在只剩 10 个 metric（`roshan_kills` 只做通用）。每轮只抽 1 个通用候选、一天 3 个，10 条的池子配合轮间去重已经够用，**不需要为同一 metric 再配多个难度档**——难度已经由 3.3 的星级承担

`target` 不在本工作项决定——先填一个量级合理的占位值，统一留给 12.4 调整。

### 12.3 机制实现（本 spec 覆盖的部分）

第 6~11 节描述的数据模型、接口契约、服务端逻辑、测试策略。**不依赖 12.2 也不依赖 12.4**——机制与任务池内容正交，可以用现有任务池的占位数值先实现并测试，等 12.2 产出后替换 `config/tasks.ts` 即可。

唯一需要提前定的参数：**每天轮数**，默认保持 3。

### 12.4 数值标定（最后一步，独立工作项）

12.2 交付的 `target` 是量级合理的占位值，不是标定过的。上线前用 12.1 积累的 BigQuery 数据统一调整一遍。

- **口径变了**：原 `target` 按跨局累积标定（`general_hero_damage: 500000` 这类），现在是**单局达标**，必须按单局分布重标
- **只标 1★ 基准值**：2★ / 3★ 由 3.3 的倍率或加法档推导，不单独标；基础 target 按可稳定完成的较低分位设置，再用实际完成率校准三档难度
- **样本范围**：`WHERE difficulty BETWEEN 1 AND 8`，dota 与 hard 合并（见 12.1）
- **英雄任务按英雄切分**，通用任务用全体样本
- **`stun_duration` 单位由毫秒改秒**：原任务池里 `general_stun_duration: 60000` 这类数值要先换算再标

这一项是 Phase1 唯一等数据的工作，做完即可上线。

#### 12.4.1 查询范围与清洗口径

标定数据只取实际启用每日任务的生产对局，并统一使用以下过滤条件：

- GA4 event 为 `game_end_player`（历史的 G/K/A 例外见 12.4.3）
- `difficulty BETWEEN 1 AND 8`，dota 与 hard 合并
- `server_type = 'WINDY'`，排除测试地图、localhost 和未知来源
- `steam_id > 0`，只统计真人
- `is_disconnect = 0`，排除掉线玩家
- `matchId IS NOT NULL`；`game_end_player` 中参数名是 camelCase 的 `matchId`，BigQuery 中读取
  `ep.value.int_value`，不能只读 `string_value`
- 按 `event_date + match_id + steam_id` 去重，同一玩家同一局只保留最后一个 event
- JSON 中不存在的指标保持 `NULL` 并排除，不得补成 `0`；真实上报的 `0` 保留

不连接 `game_end_match`。七项指标本来就在同一条 `game_end_player` 中；连接不仅增加复杂度，
还会受到 `game_end_match` 的 25 参数上限和 `player_N` 丢失影响。历史 G/K/A 只能使用
`game_end_match` 时也应单独统计，不与七项指标 join。

下面的查询同时输出总体分布和按英雄分布。通用任务使用 `scope = 'general'`，英雄任务使用
`scope = 'hero' AND hero_name = ...`。日期结束值默认取昨天，避免查询仍在持续写入的当天表。

```sql
DECLARE start_suffix STRING DEFAULT '20260811';
DECLARE end_suffix STRING DEFAULT FORMAT_DATE(
  '%Y%m%d',
  DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 1 DAY)
);

WITH extracted AS (
  SELECT
    event_date,
    event_timestamp,
    (SELECT ep.value.int_value
     FROM UNNEST(event_params) AS ep
     WHERE ep.key = 'steam_id'
     LIMIT 1) AS steam_id,
    (SELECT ep.value.int_value
     FROM UNNEST(event_params) AS ep
     WHERE ep.key = 'matchId'
     LIMIT 1) AS match_id,
    (SELECT ep.value.int_value
     FROM UNNEST(event_params) AS ep
     WHERE ep.key = 'difficulty'
     LIMIT 1) AS difficulty,
    (SELECT ep.value.string_value
     FROM UNNEST(event_params) AS ep
     WHERE ep.key = 'server_type'
     LIMIT 1) AS server_type,
    COALESCE((
      SELECT ep.value.int_value
      FROM UNNEST(event_params) AS ep
      WHERE ep.key = 'is_disconnect'
      LIMIT 1
    ), 0) AS is_disconnect,
    (SELECT ep.value.string_value
     FROM UNNEST(event_params) AS ep
     WHERE ep.key = 'hero_name'
     LIMIT 1) AS hero_name,
    (SELECT ep.value.string_value
     FROM UNNEST(event_params) AS ep
     WHERE ep.key = 'player_stats'
     LIMIT 1) AS player_stats
  FROM `windy10v10ai.analytics_311407566.events_*`
  WHERE _TABLE_SUFFIX BETWEEN start_suffix AND end_suffix
    AND event_name = 'game_end_player'
),
valid AS (
  SELECT *
  FROM extracted
  WHERE steam_id > 0
    AND match_id IS NOT NULL
    AND difficulty BETWEEN 1 AND 8
    AND server_type = 'WINDY'
    AND is_disconnect = 0
    AND player_stats IS NOT NULL
),
deduplicated AS (
  SELECT *
  FROM valid
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY event_date, match_id, steam_id
    ORDER BY event_timestamp DESC
  ) = 1
),
wide AS (
  SELECT
    hero_name,
    SAFE_CAST(JSON_VALUE(player_stats, '$.hd') AS FLOAT64) AS hero_damage,
    SAFE_CAST(JSON_VALUE(player_stats, '$.dt') AS FLOAT64) AS damage_taken,
    SAFE_CAST(JSON_VALUE(player_stats, '$.he') AS FLOAT64) AS healing,
    SAFE_CAST(JSON_VALUE(player_stats, '$.lh') AS FLOAT64) AS last_hits,
    SAFE_CAST(JSON_VALUE(player_stats, '$.tk') AS FLOAT64) AS tower_kills,
    SAFE_CAST(JSON_VALUE(player_stats, '$.st') AS FLOAT64) AS stun_duration,
    SAFE_CAST(JSON_VALUE(player_stats, '$.rk') AS FLOAT64) AS roshan_kills
  FROM deduplicated
),
metric_rows AS (
  SELECT hero_name, metric, value
  FROM wide
  UNPIVOT EXCLUDE NULLS (value FOR metric IN (
    hero_damage AS 'hero_damage',
    damage_taken AS 'damage_taken',
    healing AS 'healing',
    last_hits AS 'last_hits',
    tower_kills AS 'tower_kills',
    stun_duration AS 'stun_duration',
    roshan_kills AS 'roshan_kills'
  ))
),
distributions AS (
  SELECT 'general' AS scope, CAST(NULL AS STRING) AS hero_name, metric, value
  FROM metric_rows
  UNION ALL
  SELECT 'hero' AS scope, hero_name, metric, value
  FROM metric_rows
)
SELECT
  scope,
  hero_name,
  metric,
  COUNT(*) AS sample_count,
  COUNTIF(value = 0) AS zero_count,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(value = 0), COUNT(*)), 2) AS zero_rate_pct,
  MIN(value) AS minimum_value,
  ROUND(AVG(value), 2) AS average_value,
  APPROX_QUANTILES(value, 100)[OFFSET(10)] AS p10,
  APPROX_QUANTILES(value, 100)[OFFSET(20)] AS p20,
  APPROX_QUANTILES(value, 100)[OFFSET(30)] AS p30,
  APPROX_QUANTILES(value, 100)[OFFSET(50)] AS p50,
  APPROX_QUANTILES(value, 100)[OFFSET(75)] AS p75,
  APPROX_QUANTILES(value, 100)[OFFSET(90)] AS p90,
  APPROX_QUANTILES(value, 100)[OFFSET(95)] AS p95,
  MAX(value) AS maximum_value
FROM distributions
GROUP BY scope, hero_name, metric
ORDER BY IF(scope = 'general', 0, 1), metric, sample_count DESC;
```

#### 12.4.2 P30 / P50 / P75 标定策略

任务判定条件是 `value >= target`，所以分位数要按上尾概率理解：

- **1★ 基准 target 靠近 P30**：约 70% 的对应样本能完成，保证有稳定的保底选择
- **2★ 的 `1.5 × target` 靠近 P50**：约 50% 能完成
- **3★ 的 `2 × target` 靠近 P75**：约 25% 能完成，有挑战但不是极少数对局才能完成

P30/P50/P75 是方向，不是三个可以独立填写的 target。配置只保存 1★ 基准值，必须在候选值
`T` 上同时检查 `T / 1.5T / 2T` 落在分布的什么位置；优先保证 1★ 不会卡轮，再让 2★、
3★ 尽量接近 P50、P75。无法同时贴合时，不为了精确命中某个分位数引入难读的零碎数字，
大数值基准应取接近分位数的整洁偶数档。

使用分位数时还要遵守以下规则：

1. **看中位数和分位数，不看平均值与最大值。** 超长局、异常局会显著拉高平均值和最大值，
   但对 P30/P50/P75 的影响有限。
2. **英雄任务按该英雄自己的分布标定。** 同一 metric 在不同英雄之间不能共用一个 target。
3. **通用任务通常高于英雄任务。** 玩家看到候选后可以主动选擅长该指标的英雄，选择空间更大；
   `tower_kills` 是已确认的例外，因为总共只有 11 座塔且归属容易被队友或小兵拿走。
4. **大量零值的指标不能直接套总体 P30。** `assists`、`healing`、`roshan_kills`、
   `tower_kills` 要同时看零值率、非零样本分布和适合该指标的英雄分布。P30 为 0 不代表
   target 应设为 0。
5. **小整数指标用精确达成率。** 对 `t / t+1 / t+2` 分别计算
   `COUNTIF(value >= target) / COUNT(*)`；离散分布会让多个分位数相同，不能只看近似分位数。
6. **先看样本量再改数值。** `sample_count >= 100` 才做常规调整；30～99 只修正明显不可达
   或明显白送的 target；低于 30 保持现值并继续积累。该阈值按“英雄 + metric”判断，不按英雄
   的总出场数判断。
7. **先修过难，再修过易。** 完全无法完成会卡住轮次；略微偏简单只会让奖励更容易获得，
   对体验的伤害较小。
8. **分批修改。** 第一批只处理样本充分且偏离最大的少数项目，上线后观察实际完成情况，
   再处理下一批，避免一次性改动整个任务池后无法判断是哪项调整造成变化。

对于候选 target，还要补算真实达成率，而不是仅凭查询表中的两个相邻分位数线性推断：

```sql
SELECT
  COUNT(*) AS sample_count,
  COUNTIF(value >= @target_1_star) AS completed_1_star,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(value >= @target_1_star), COUNT(*)), 2)
    AS completion_rate_1_star_pct,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(value >= @target_1_star * 1.5), COUNT(*)), 2)
    AS completion_rate_2_star_pct,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(value >= @target_1_star * 2), COUNT(*)), 2)
    AS completion_rate_3_star_pct
FROM metric_rows
WHERE metric = @metric;
```

这里的 `@target_1_star` 和 `@metric` 是 BigQuery 查询参数；英雄任务还要过滤对应 `hero_name`。
大数值任务的目标完成率约为 70% / 50% / 25%。小整数任务把三个表达式中的 target 替换为
`T / T+1 / T+2`。

对于 `tower_kills` 这类离散指标，“target 是 P 几”不是单个精确值：同一个整数可能占据一段
分位区间。应直接统计 `< target`、`<= target` 和 `>= target`，同时得到分位区间和真实完成率：

```sql
WITH targets AS (
  SELECT target
  FROM UNNEST([4, 5, 6]) AS target
)
SELECT
  target,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(value < target), COUNT(*)), 2) AS percentile_lower_pct,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(value <= target), COUNT(*)), 2) AS percentile_upper_pct,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(value >= target), COUNT(*)), 2) AS completion_rate_pct
FROM metric_rows
CROSS JOIN targets
WHERE metric = 'tower_kills'
GROUP BY target
ORDER BY target;
```

对于大量零值的指标，保留总体分布用于计算实际完成率，同时另外查询正值条件分布，判断
“玩家确实产生该行为以后”的难度。以 `healing` 为例：

```sql
SELECT
  COUNT(*) AS positive_sample_count,
  MIN(value) AS minimum_positive_value,
  APPROX_QUANTILES(value, 100)[OFFSET(30)] AS positive_p30,
  APPROX_QUANTILES(value, 100)[OFFSET(50)] AS positive_p50,
  APPROX_QUANTILES(value, 100)[OFFSET(75)] AS positive_p75,
  APPROX_QUANTILES(value, 100)[OFFSET(90)] AS positive_p90,
  MAX(value) AS maximum_value
FROM metric_rows
WHERE metric = 'healing'
  AND value > 0;
```

正值条件分布不能替代总体完成率。比如 75% 对局治疗为 0，即使正值 P30 很低，所有零值对局
仍然无法完成任何正 target；两组结果必须一起判断。英雄治疗任务还要追加对应
`hero_name`，避免把没有治疗能力的英雄混入分布。

#### 12.4.3 历史 G/K/A 的临时查询

`player_stats_basic` 上线后的新数据应直接从 `game_end_player` 读取 `$.g` / `$.k` / `$.a`，
并合并进 12.4.1 的 `wide` 和 `UNPIVOT`。上线前的历史数据只能从
`game_end_match.player_N` 读取；这份数据受 GA4 每 event 25 参数上限影响，只用于初步判断，
不作为英雄级 G/K/A 最终标定的唯一依据。

历史查询仍然单独输出总体与按英雄分布，不与 `game_end_player` join：

```sql
DECLARE start_suffix STRING DEFAULT '20260811';
DECLARE end_suffix STRING DEFAULT FORMAT_DATE(
  '%Y%m%d',
  DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 1 DAY)
);

WITH match_events AS (
  SELECT
    event_date,
    event_timestamp,
    COALESCE(
      (SELECT ep.value.int_value
       FROM UNNEST(event_params) AS ep
       WHERE ep.key = 'match_id'
       LIMIT 1),
      SAFE_CAST((
        SELECT ep.value.string_value
        FROM UNNEST(event_params) AS ep
        WHERE ep.key = 'match_id'
        LIMIT 1
      ) AS INT64)
    ) AS match_id,
    (SELECT ep.value.int_value
     FROM UNNEST(event_params) AS ep
     WHERE ep.key = 'difficulty'
     LIMIT 1) AS difficulty,
    (SELECT ep.value.string_value
     FROM UNNEST(event_params) AS ep
     WHERE ep.key = 'server_type'
     LIMIT 1) AS server_type,
    event_params
  FROM `windy10v10ai.analytics_311407566.events_*`
  WHERE _TABLE_SUFFIX BETWEEN start_suffix AND end_suffix
    AND event_name = 'game_end_match'
),
player_rows AS (
  SELECT
    event_date,
    event_timestamp,
    match_id,
    SAFE_CAST(JSON_VALUE(player_param.value.string_value, '$.si') AS INT64) AS steam_id,
    SAFE_CAST(JSON_VALUE(player_param.value.string_value, '$.hi') AS INT64) AS hero_id,
    COALESCE(
      SAFE_CAST(JSON_VALUE(player_param.value.string_value, '$.dc') AS BOOL),
      FALSE
    ) AS is_disconnect,
    SAFE_CAST(JSON_VALUE(player_param.value.string_value, '$.k') AS FLOAT64) AS kills,
    SAFE_CAST(JSON_VALUE(player_param.value.string_value, '$.a') AS FLOAT64) AS assists,
    SAFE_CAST(JSON_VALUE(player_param.value.string_value, '$.g') AS FLOAT64)
      AS total_gold_earned
  FROM match_events
  CROSS JOIN UNNEST(event_params) AS player_param
  WHERE match_id IS NOT NULL
    AND difficulty BETWEEN 1 AND 8
    AND server_type = 'WINDY'
    AND REGEXP_CONTAINS(player_param.key, r'^player_[0-9]+$')
),
deduplicated AS (
  SELECT *
  FROM player_rows
  WHERE steam_id > 0
    AND NOT is_disconnect
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY event_date, match_id, steam_id
    ORDER BY event_timestamp DESC
  ) = 1
),
metric_rows AS (
  SELECT hero_id, metric, value
  FROM deduplicated
  UNPIVOT EXCLUDE NULLS (value FOR metric IN (
    kills AS 'kills',
    assists AS 'assists',
    total_gold_earned AS 'total_gold_earned'
  ))
),
distributions AS (
  SELECT 'general' AS scope, CAST(NULL AS INT64) AS hero_id, metric, value
  FROM metric_rows
  UNION ALL
  SELECT 'hero' AS scope, hero_id, metric, value
  FROM metric_rows
)
SELECT
  scope,
  hero_id,
  metric,
  COUNT(*) AS sample_count,
  COUNTIF(value = 0) AS zero_count,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(value = 0), COUNT(*)), 2) AS zero_rate_pct,
  MIN(value) AS minimum_value,
  ROUND(AVG(value), 2) AS average_value,
  APPROX_QUANTILES(value, 100)[OFFSET(10)] AS p10,
  APPROX_QUANTILES(value, 100)[OFFSET(20)] AS p20,
  APPROX_QUANTILES(value, 100)[OFFSET(30)] AS p30,
  APPROX_QUANTILES(value, 100)[OFFSET(50)] AS p50,
  APPROX_QUANTILES(value, 100)[OFFSET(75)] AS p75,
  APPROX_QUANTILES(value, 100)[OFFSET(90)] AS p90,
  APPROX_QUANTILES(value, 100)[OFFSET(95)] AS p95,
  MAX(value) AS maximum_value
FROM distributions
GROUP BY scope, hero_id, metric
ORDER BY IF(scope = 'general', 0, 1), metric, sample_count DESC;
```

### 12.5 上线顺序：API 先，game 后

与 5A.4（#1050 建议 game 先行）**相反**。Phase1 必须 API 先上线，中间会有一段旧 game 对新 API 的窗口期。

**API 新 / game 旧是安全的**：新增的 `dailyTask` 字段是 `@IsOptional()`，不发送即通过校验；8.3 要求 `dailyTask` 存在且 `dailyTask.dayId` 非空才记录，旧客户端直接跳过整段逻辑。`/game/start` 多返回的 `dailyTasks` 被旧客户端忽略——按 5.4，客户端本来就必须容忍不认识的候选。窗口期会创建出 `completedTasks` 为空的文档，但按 8.2 当天无完成不写 history 条目，**不产生需要清理的脏数据**，game 上线后直接接着用。

GA4 的 `point_daily_task` 在窗口期恒为缺省，按 5A.2A 兜底为 0 即可——窗口期玩家确实没有任务积分，0 语义正确，不需要为窗口期做任何特殊处理。

**反向顺序（game 先）不可行**：旧 API 静默接受未知字段，挑战积分会照常并入 `battlePoints` 入账，但完成记录永不落库——`currentRound` 恒为 0，玩家每局拿到同一批候选，可无限刷分。且 7.3 的 cap 改动必须先于 game 上线，否则 3★ 顶破 500 会丢掉该玩家整个基础结算。

## 13. 客户端需要同步的改动（game 仓库）

**game `develop` 上目前没有任何每日任务代码**——PR #2310 仍是 OPEN 未合并。因此下面的"保留 / 新增 / 删除"是**相对 #2310 而言**：保留 = 从 #2310 挑出来用，删除 = 不采纳。实际落地建议从 `develop` 切新分支重做，而不是在 #2310 上改——要保留的部分（UI + 本地化）挑过来即可，见 13.5 的任务拆分。

### 13.1 保留（从 #2310 挑出来用）

- Panorama UI 全套（页面、候选卡、星级徽章、历史面板、结算页积分）
- 三语本地化资源——按 10 个 metric 重新裁剪模板；**显示文案保持「每日挑战」不变**，改名只动标识符（见 10.1）
- `daily-challenge-controller.ts` 的 UI 交互与状态管理部分——文件与标识符随 10.1 改名为 `daily-task-controller.ts`

### 13.2 新增

- **模式门控**：按 3.5 判定本局是否启用（`GetMapName() === 'custom'` 即禁用）；禁用时不展示候选、不判定、不计分、不上报
- **指标读取**：一个函数，按 `metric` 分发到对应的 `PlayerResource` 调用，局内展示与结算判定时各调一次
- **达标判定**：用服务端下发的 `metric` / `target` / `heroName` 在局内判定，英雄不匹配的候选在 UI 上禁用
- **计分**：达标后把 `rewardSeasonPoint` 计入本局 `battlePoints`（加在行为分倍率之后，见 5A.2A）
- **掉线不结算**：构建 `playerDto` 时若 `isDisconnected` 为真，既不设 `dailyTask` 也不把奖励加进 `battlePoints`，哪怕退出前指标已达标（见 3.5）
- **未知候选保护**：按 5.4，不认识的 `taskId` / `metric` 不得崩溃，不展示或标为不可完成，且不判定不上报
- `game-end.ts`：`players[i]` 多发 `dailyTask` 对象（`dayId` / `taskId` / `star` / `seasonPoint` 必须齐全，缺一不可，否则整局结算会被 400；`stuns` / `roshanKills` 已随 #1050 上线）

### 13.3 不采纳：全部采集模块

10 个指标全部走 `PlayerResource` 原生 API，采集代码归零。#2310 里的这些模块一个都不要：

| 模块 | 原因 |
| --- | --- |
| `daily-challenge-modifier-classifier.ts` | 6 个控制指标删除（5.2） |
| `daily-challenge-damage-observer.ts` | 伤害分类删除（5.2A） |
| `daily-challenge-damage-event.ts` | 同上 |
| `daily-challenge-telemetry.ts` | 三个输入源（modifier 扫描 / 伤害 filter / `entity_killed`）全部消失，无剩余职责 |
| `daily-challenge-accumulator.ts` | 无写入方 |
| `daily-challenge-ownership.ts` | 无调用方 |
| `daily-challenge-contribution-collector.ts` | 服务端不再接收指标数值 |
| `daily-challenge-metric-snapshot.ts` | 由 13.2 的指标读取函数取代，`damage_taken` 的循环逻辑可直接搬过去 |

`stun_duration` 与 `roshan_kills` 改用 `GetStuns()` / `GetRoshanKills()`，`bot_kills` 并入 `kills`——`entity_killed` 监听随之删除。三语资源里 3 条 `bot_kills` 文案删除。

### 13.4 其余不采纳

- `daily-challenge-match-context.ts` 的挑战日顺序保护、`confirmMatchStart()`
- `shouldReplaceDailyChallengeSnapshot()` 及 VScript store / Panorama client 两层防回退
- `daily-challenge-snapshot.ts` 的独立接口调用（accept / refresh / view / snapshot）
- `DailyChallengeSnapshotVersion` 类型与全部版本兼容分支

### 13.5 game 侧任务拆分

从 `develop` 切新分支，建议拆 3 个 PR：

| # | 内容 | 依赖 |
| --- | --- | --- |
| G1 | vscripts 骨架：模式门控（3.5）、指标读取函数（5.1，`damage_taken` 的循环从 #2310 的 `metric-snapshot` 搬）、达标判定、候选本地状态 | API 的 `/game/start` 契约（7.1）已定，可立刻开工 |
| G2 | `game-end.ts` 结算改造：计分顺序（5A.2A）、掉线不结算（3.5）、发含 `dayId` 的 `dailyTask` 对象（7.2） | G1 |
| G3 | Panorama UI + 三语本地化：候选卡按新 DTO 裁剪（去掉 `progress` / `unit` / 版本号）、星级徽章、历史面板显示 `taskId` + `star`、未知候选保护（5.4） | G1 |

三个 PR 都要带上 10.1 的改名（`dailyChallenge` → `dailyTask`），显示文案保持「每日挑战」不变。

**不需要在 game 仓库另写设计文档。** 本 spec 已经覆盖了 game 侧需要的全部契约（3.5 门控、5.1 指标口径、5.4 未知任务保护、7 接口契约、13 改动清单），另写一份只会产生漂移。game 仓库那边用 issue 跟踪上面三项即可，issue 里链回本文档。

## 14. 现有实现（PR #1040 / #2310）的去留

### 14.1 跨阶段复用（约 3300 行，其中 2837 是任务池数据）

下表的路径是**现有** PR 的文件名。复用的部分一律迁到 `api/src/daily-task/`，文件名与标识符按 10.1 改名，下面不再逐行重复。

| 文件 | 行数 | 处置 |
| --- | --- | --- |
| `config/tasks.ts` | 2837 | **保留文件结构与 127 英雄清单**，但内容需要重新设计——404 条里 204 条用的是被删指标。见 12.2，独立工作项 |
| `config/tasks.spec.ts` | 234 | 保留大部分守卫，删掉 `dataVersion` 断言和共同任务相关断言 |
| `services/daily-challenge-generation.service.ts` | 134 | **核心算法直接复用**（FNV-1a、seeded pick）。`pickStar` 改为按 seed 洗牌 `[1,2,3]` 分配（见 3.3）；`getMetricCategory` 随"同轮两个通用任务不同类"一起删除——每轮只有 1 个通用候选了；删掉 `seenTaskIds` 回退后约 100 行 |
| `services/daily-challenge-generation.service.spec.ts` | 183 | 同上，按新签名调整 |
| `services/daily-challenge-personal-config.ts` + spec | 136 | 保留星级目标解析，删掉毫秒取整分支，改按 3.3 的加法/乘法双档 |
| `types/daily-challenge.types.ts` | 137 | 保留 enum 内容，删掉三张 metric 映射表和两个版本常量；随模块改名为 `types/daily-task.types.ts`，enum 改名 `TaskScope` / `TaskMetric`（见 10.1）|
| `util/challenge-day-clock.service.ts` | — | **不保留**，日期函数与 `PlayerRankingService.getDateString()` 合并为共享工具（见 10） |

**game 仓库**：8 个采集模块（约 1700 行含测试）全部删除，见 13.3。可保留的是 Panorama UI 全套与三语资源——这仍是 PR #2310 的大头，但可保留比例约 50%，而非采集模块留下时的 80%。

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

### 14.5 PR 处理

**两个 PR 都保持开启作为参考，不在上面改动。**

- **#1040（firebase）**：后端保留比例约 30%，其中大头还是任务池数据，实际等于重写；且它在贡献者的 fork 分支上，不适合在别人分支上做这种规模的重写。Phase1 从 `develop` 切新分支，工作拆分见 12 节
- **#2310（game）**：采集模块整套不采纳（13.3），保留的只有 Panorama UI 与三语本地化，且都要按新 DTO 裁剪。从 `develop` 切新分支重做并 cherry-pick 那两部分，工作拆分见 13.5

两个 PR 留着的价值是 Phase2/3 开工时能回来查 14.2 / 14.3 里的算法思路。

### 14.6 工作项与 issue

| 工作项 | issue |
| --- | --- |
| 12.1 补 GA4 统计并积累数据 | #1050（已合并）|
| 模块骨架（12.3 的前置）| #1054 |
| 12.2 任务池重新设计 | #1055 |
| 12.3 机制实现 | #1056 |
| 12.4 数值标定 | #1057 |
| 13.5 G1 门控 + 指标读取 + 判定 | windy10v10ai/game#2334 |
| 13.5 G2 结算改造 | windy10v10ai/game#2335 |
| 13.5 G3 UI 与本地化 | windy10v10ai/game#2336 |
