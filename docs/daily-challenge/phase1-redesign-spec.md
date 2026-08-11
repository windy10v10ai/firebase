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

每个候选独立掷一个星级，决定目标与奖励：

| 星级 | 目标倍率 | 赛季积分 |
| --- | --- | --- |
| 1★ | 0.75 | 60 |
| 2★ | 1.0 | 80 |
| 3★ | 1.5 | 100 |

单日个人赛季积分上限 300（三轮全 3★）。

星级由 seed 确定性掷出，权重 1:1:1。

**小整数指标用加法档，大数值用乘法档。** 乘法对小整数会退化——`target = 1` 时三档算出 `1 / 1 / 2`，`target = 2` 时 `2 / 2 / 3`，都有重复：

```ts
const SMALL_TARGET_THRESHOLD = 10;

const scaled =
  task.target < SMALL_TARGET_THRESHOLD
    ? task.target + (star - 1)              // t / t+1 / t+2
    : task.target * multipliers[star];      // 0.75 / 1.0 / 1.5

return Math.max(1, Math.round(scaled));
```

| 指标 | target | 三档 |
| --- | ---: | --- |
| `roshan_kills` | 1 | 1 / 2 / 3 |
| `tower_kills` | 3 | 3 / 4 / 5 |
| `kills` | 20 | 15 / 20 / 30 |
| `hero_damage` | 500000 | 375000 / 500000 / 750000 |

若不这样处理，`roshan_kills` 要靠乘法拉开三档就得把 target 标到 ≥ 3，意味着 3★ 需要单局击杀 5 次肉山，不现实。顺带把 `tower_kills` 从 `2 / 3 / 5` 修正为 `3 / 4 / 5`，跨度更合理。

原实现的毫秒取整分支删除——`stun_duration` 改用 `GetStuns()` 后单位由 5.1 的实机验证决定。

### 3.4 英雄专属任务

每轮 3 个候选中固定 1 个是英雄专属。客户端在判定时检查本局英雄是否匹配 `heroName`，不匹配则该任务不可完成。

候选早于选英雄下发（见 3.1），且**本模式允许重复选择同一英雄**，所以不存在"英雄被别人抢走导致任务不可能完成"的情况——玩家只要愿意就一定能选到。

**UI 必须在选英雄阶段就展示英雄专属候选**，否则玩家选完英雄才看到"用莉娜打出 X 伤害"，这一轮的英雄任务就白白作废了。

### 3.5 生效条件（模式门控）

自定义选项会让 target 失去意义——5 倍金钱下「打 50 万英雄伤害」是白送。现有 `battlePoints` 对自定义模式用的是**倍率缩放**（`GetCustomModeMultiplier`），这对固定 target 的任务无效，因此每日挑战需要一个**二值门控**。

判定在客户端，复用现有函数：

```ts
const DAILY_CHALLENGE_MIN_MULTIPLIER = 1;

function isDailyChallengeEnabled(option: Option, difficulty: number, isLocalhost: boolean): boolean {
  // 秒活让击杀/伤害类任务失去意义，单独拦截：
  // 它在倍率里只乘 0.7，配合加难选项后仍可能高于阈值
  if (option.respawnTimePercentage < 100) {
    return false;
  }
  // 作弊模式与 localhost 返回 0，自定义模式走 GetCustomModeMultiplier
  return (
    GameEndPoint.GetDifficultyMultiplier(difficulty, isLocalhost, option) >=
    DAILY_CHALLENGE_MIN_MULTIPLIER
  );
}
```

阈值 1.0 的依据：全默认选项下 `GetCustomModeMultiplier` 恰好等于 1.0（`1 → ×1.1`（金钱倍率 < 1.3）`→ -0.1`（塔强度 ≤ 150）`→ ×1.0`（敌方 10 人）），所以这条线正好放行"没改任何设置"、拦下"改简单了"。

| 场景 | 倍率 | 每日挑战 |
| --- | --- | --- |
| 全默认 | 1.0 | 生效 |
| 预设难度 1~8 | 1.2 ~ 2.4 | 生效 |
| 敌方金钱 20 倍（更难）| 2.3 | 生效 |
| 玩家金钱 5 倍 | 0.1 | 禁用 |
| 中路模式 / 固定技能 | 0.8 | 禁用 |
| 敌方人数 5 | 0.5 | 禁用 |
| 秒活（任意加难组合）| — | 禁用（独立规则）|
| 作弊模式 / localhost | 0 | 禁用 |

禁用时客户端的行为：**不展示候选、不判定、不计分、不上报 `dailyChallengeTaskId`**。服务端因此不会记录轮次，玩家**不损失当天的轮次机会**——下一局正常模式仍然面对同一组候选。

服务端不参与这个判定：`/game/start` 照常下发候选（此时对局选项可能尚未最终确定），由客户端在局内决定是否启用。

`option.respawnTimePercentage < 100` 采用的是"任意复活时间削减都禁用"的保守口径。若只想拦真正的秒活，可收紧为 `<= 10`（与倍率函数里 ×0.7 那一档对齐）。

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

- **模式门控**：按 3.5 判定本局是否启用每日挑战
- **指标读取**：10 个指标全部走 `PlayerResource` 原生 API，局内展示与结算判定时各读一次。**没有采集代码**——无定时器、无 filter、无高频事件监听，见 5.2 / 5.2A
- **达标判定**：用服务端下发的 `metric` / `target` / `heroName` 在局内判定
- **计分**：达标后把 `rewardSeasonPoint` 计入本局 `battlePoints`
- **全部文案**：`addon_schinese/english/russian.txt`，按 `scope` + `metric` 拼本地化 key，替换 `{hero}` / `{target}`。英雄名走 DOTA 自带的 `#npc_dota_hero_*`。`unit`（次数/伤害/秒）由 `metric` 在客户端映射
- **候选选择**：本地状态，零网络请求
- **UI**：HUD 入口、挑战面板、候选卡、星级徽章、今日记录、历史列表、结算页积分

### 4.2 API

职责收缩为两件事：

- **候选生成**：确定性抽取 + 星级掷点，下发 `taskId` / `scope` / `metric` / `heroName` / `star` / `target` / `rewardSeasonPoint`
- **轮次记录**：`/game/end` 上报 `taskId` + 奖励值后记一轮完成，推进轮次、跨天重置、维护 history

`/game/end` 上服务端是纯记录器——不重算候选、不验证 taskId、不验证数值、不发放积分（见 8.3.1）。

**服务端不再需要**：`ChallengeMetric` → `GameEndPlayerDto` 字段映射、`DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION`、`DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION`、`DAILY_CHALLENGE_METRIC_UNIT`、达标判定逻辑、赛季积分发放路径。

**候选生成必须留在服务端**——否则玩家可以自己宣称抽到了三个最容易的任务。这是唯一不可下放的部分。`target` 和 `rewardSeasonPoint` 由服务端随候选下发，客户端只是执行服务端定的规则，**任务池仍然是单一来源**，不存在两端各维护一份的漂移风险。

## 5. 指标范围与口径

**10 个指标，全部来自 DOTA 原生 API。** 从原 19 个收敛而来，依据是一条硬约束加两条清理：

> **客户端不得为每日挑战引入任何定时器、伤害 filter 或高频事件监听。** 10v10 后期伤害与 modifier 事件频率极高，任何 per-event 回调都是卡顿风险，而每日挑战不值得让对局体验承担这个代价。

在这条约束下，只有能通过 `PlayerResource` 在结算时刻一次读取的指标才能保留。此外语义重复的合并（`bot_kills` → `kills`，见 5.3）。

服务端不看数值，指标多少对服务端没有成本——收敛完全是为了客户端性能。`ChallengeMetric` enum 保留（候选要下发 metric 给客户端），`DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION` / `_UNIT` / `_MAX_MATCH_CONTRIBUTION` 三张表全部删除。

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
| `stun_duration` | `PlayerResource.GetStuns()` |
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

**`GetStuns()` 的口径必须实机验证**：返回值单位是秒还是毫秒、是否为浮点、是否只统计对敌方英雄。这三点决定 target 怎么标，见 12.1。

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

- `ChallengeMetric` 删除 `PHYSICAL_DAMAGE` / `MAGICAL_DAMAGE` / `PURE_DAMAGE`
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
- `ChallengeMetric.BOT_KILLS` 从 enum 删除
- 客户端 `telemetry.ts` 的 `bot_kills` 计数分支删除
- 三语资源里 3 条 `bot_kills` 文案删除

### 5.4 运维约定（替代 `dataVersion`）

新增 metric 的任务，必须在客户端发布**之后**才上线到任务池。DOTA2 自定义游戏进服强制更新，客户端版本分裂窗口很短。若违反，老客户端拿到无法采集的 metric 时应在 UI 上禁用该候选而非静默失败。

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

`game_end_player` 变 **20 个参数**，留 5 个余量；值 68 字符，在 100 以内。BigQuery 侧用 `JSON_VALUE()` 解析。

### 5A.2A 赛季积分的拆分维度

`points`（= `battlePoints`）现在只有总额。积分实际由三部分构成（`game-end.ts`）：

```
score + gameTimePoints            = basePoints
basePoints × 难度倍率 × 胜负倍率   = rawBattlePoints
round(raw × 行为分倍率)            = finalBattlePoints
finalBattlePoints - rawBattlePoints = pointModifier   ← 行为分加成/惩罚
```

再加上 Phase1 的每日挑战奖励。为了能按英雄、难度、胜负、国家切分这三个维度，`game_end_player` 增加**两个独立数值参数**（第三个可推导）：

| 参数 | 来源 | 说明 |
| --- | --- | --- |
| `point_modifier` | `finalBattlePoints - rawBattlePoints` | 行为分加成，可正可负 |
| `point_daily_challenge` | `player.dailyChallengeSeasonPoint` | Phase1 上线后才有值 |

基础积分 = `points - point_modifier - point_daily_challenge`，不必单独发送。

**用独立参数而非打包 JSON**：这三个要注册成 GA4 自定义指标、直接求和求平均；`player_stats` 那 7 个是一次性标定用的分析数据，打包无妨。

**不新开 event**：积分维度要按英雄/难度/胜负/国家切分，而这些维度全都已经在 `game_end_player` 上。独立 event 需要靠 `session_id` join 才能关联，GA4 界面里做不到，只能退化成 BigQuery SQL。

参数预算变为 **22 / 25**，剩 3 个。不够时 `win_metrics`（与 `is_winner` 逐字重复）和 `hero_name_cn`（可从 `hero_name` 推导）是两个可回收的名额。

**`point_modifier` 不依赖每日挑战，建议随 #1050 一起上线。** `point_daily_challenge` 需等 Phase1，字段可先留位。

**语义变更提醒**：每日挑战上线后 `battlePoints` 含挑战积分，`points` 的时间序列会在上线当天跳变。有 `point_daily_challenge` 可反推纯对局积分，但 BigQuery 看板说明里要标注这个断点。

**不做 `?? 0` 兜底。** `stuns` 的 `0` 表示「本局没控到人」，是真实观测值；若把「没上报」也记成 `0`，标定时无法区分两者，那批假零会把分位数整体拉低。字段缺失时 `JSON.stringify` 自动丢弃该 key，BigQuery 得到 `NULL`，标定查询用 `IS NOT NULL` 排除即可。

（这与 issue #1014 的 `awaken ?? 0` 相反——`awaken` 的 `0` 就是「未觉醒」，缺省按 0 语义正确。）

### 5A.3 `GameEndPlayerDto` 新增字段

| 新字段 | 来源 |
| --- | --- |
| `stuns` | `PlayerResource.GetStuns()` |
| `roshanKills` | `PlayerResource.GetRoshanKills()` |

其余 5 个缺失指标（`heroDamage` / `damageTaken` / `healing` / `lastHits` / `towerKills`）DTO 里已经有，只是没进 GA4。

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

候选由 `(dayId, steamId, round)` 确定性生成——taskId、星级、目标、奖励全部可算出。因此不存 `candidates`、不存 `star`、不存 `target`。

生成只发生在 `/game/start`。`/game/end` **不重算、不验证**（见 8.3.1），上报什么就记什么，奖励值由客户端一并发来。跨天迟到局同理，不需要保留任何昨天的快照。

**因此不存在任务池的运维约束。** 早期设计要求"已上线任务的 `id` 与 `metric` 不得修改、只在挑战日边界部署"，那是为了让 `/game/end` 的重算与当初下发的候选一致。取消重算后这条约束一并消失——任务池可以随时改，最坏情况是玩家已看到的候选在下次 `/game/start` 变了，属于 UX 抖动而非数据错误。`configVersion` 因此彻底没有存在必要。

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
          "metric": "stun_duration",
          "star": 1,
          "target": 45,
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

请求：`GameEndPlayerDto` 新增两个可选字段，`GameEndDto` 顶层新增一个可选字段。挑战积分由客户端**直接计入 `battlePoints`**——`dailyChallengeSeasonPoint` 不参与入账，只用于服务端记录统计数字与 GA4 拆分维度。

```ts
export class GameEndPlayerDto {
  // ... 现有字段不变，battlePoints 已含每日挑战奖励
  /** 本局完成的每日挑战任务；未完成时不发送 */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dailyChallengeTaskId?: string;

  /** 该任务的奖励值，取自 /game/start 下发的候选；与 taskId 同时发送 */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyChallengeSeasonPoint?: number;
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

`dailyChallengeSeasonPoint` 由客户端发来而非服务端重算，是 8.3.1 的直接结果：服务端要往 `todaySeasonPoint` / `history[].seasonPoint` 里记一个数，而客户端已经知道这个数（`/game/start` 下发的），重算一遍没有意义。

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
if (该桶已完成轮数 >= 3): 丢弃并 logger.warn
写入对应桶：
    当天    → completedTaskIds.push(taskId); todaySeasonPoint += dailyChallengeSeasonPoint
    history → history[0].rounds += 1; history[0].seasonPoint += dailyChallengeSeasonPoint
写回
```

**服务端不重算候选、不验证 taskId、不验证指标数值、不发放积分。** 它在 `/game/end` 上是一个纯记录器。

### 8.3.1 为什么去掉候选重算验证

早期设计在这里重算 `generateCandidates(dayId, steamId, round)`，再断言上报的 `taskId` 在候选里。这一步被整个移除，原因有二：

1. **与信任前提自相矛盾。** 全套设计建立在"`/game/end` 经 `x-api-key` 校验、数据可信"之上——达标判定、指标数值、积分计算全部交给客户端。唯独在 taskId 上做防伪造校验，防的是一个已经被授予了远大得多权限的对象，纯属多余。
2. **它唯一的实际产出（`rewardSeasonPoint`）由客户端一起发过来即可。** 服务端记 `todaySeasonPoint` / `history[].seasonPoint` 只是为了给 UI 展示统计数字，客户端本来就知道这个值（它是 `/game/start` 下发的）。

移除后 `generateCandidates()` 只在 `/game/start` 调用。

**连带解除一条运维约束**：6.2 原先要求"已上线任务的 `id` 与 `metric` 不得修改、任务池只在挑战日边界部署"，那是为了让跨天迟到局能重算出一致的候选。不再重算后，任务池可以随时改——最坏情况是玩家已看到的候选在下次 `/game/start` 变了，属于 UX 抖动而非数据错误。

客户端 bug 导致的加分与轮次记录不一致，属于客户端的责任范围，API 不做兜底校验。

### 8.3.2 其他

`history[0]` 的幂等判定用 `rounds` 计数无法区分具体 taskId，因此跨天回写路径下重复上报会重复计数。这是可接受的：跨天迟到本身罕见，且只影响 history 的统计数字，不影响积分。

**每个玩家独立事务，独立 try/catch。** 现有实现里任何一个玩家抛异常会中断整局结算并留下半写状态，Phase1 必须逐人隔离。

## 9. 错误处理

### 9.1 失败路径

| 情况 | 行为 |
| --- | --- |
| `/game/start` 每日挑战失败 | `logger.warn`，响应里省略 `dailyChallenges`，不阻断开局 |
| `/game/end` 单个玩家失败 | `logger.warn`，跳过该玩家，其余玩家继续 |
| 该日期桶已完成 3 轮 | 丢弃 + `logger.warn` |
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
- 轮次记录：已完成 3 轮时丢弃；掉线玩家跳过；`todaySeasonPoint` 累加客户端上报的奖励值
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

## 12. Phase1 的工作分解

Phase1 不是一个可以一次做完的改动，它有一条硬顺序：**先攒数据 → 再设计任务池 → 最后实现机制**。前两步的产出是后一步的输入，不能并行。

### 12.1 第 0 步：补 GA4 统计并积累数据

见第 5A 节。10 个指标里只有 3 个在 BigQuery 有历史。让 game 发送 `stuns` / `roshanKills`，API 把 7 个缺失指标打包进 `game_end_player`，跑够一段时间攒出分布。

**其余所有工作都依赖它。** 对应 issue：windy10v10ai/firebase#1050。

积累多久取决于日活，需要单独确认——目标是每个英雄都有足够样本量支撑分位数（英雄专属任务按英雄标定，样本要按英雄切分，冷门英雄是瓶颈）。

同期由 game 侧**实机验证 `GetStuns()` 的口径**：单位是秒还是毫秒、是否浮点、是否只统计对敌方英雄。这三点决定 `stun_duration` 的 target 怎么标。

### 12.2 任务池重新设计（独立工作项，本 spec 不覆盖）

404 条任务里有 204 条用了被删除的指标。但**实际需要人工决定的远没有那么多**——多数英雄的另外两条任务不受影响，机械替换即可。

对现有任务池按下列规则跑一遍后的实测结果：

| 替换规则 | 影响 |
| --- | --- |
| `magical` / `physical` / `pure_damage` → `hero_damage` | 150 条，机械替换 |
| `root_duration` → `stun_duration` | 8 条，机械替换（见下） |
| `bot_kills` → `kills` | 4 条，机械替换（见 5.3） |
| `slow` / `silence` / `taunt` / `break` / `debuff` | 46 条，**需人工指定** |
| `roshan_kills` 退出英雄任务 | 2 条，**需人工指定** |
| 同一英雄内 `hero_damage` 重复 | 32 个英雄，各需换掉一条 |

**合计 74 / 381 条英雄任务需要人工指定指标，65 个英雄完全不需要改动。**

`root_duration → stun_duration` 的依据是 DOTA 的 `GetStuns()` 会把缠绕时长一并计入。**这一条与 5.1 的其他口径问题一起实机验证**；若不成立，这 8 条要并入"需人工指定"。

#### 可用的空槽很充裕

需要改动的 62 个英雄身上，剩余可选指标数：

```
last_hits / total_gold_earned   67 个英雄可用
kills / assists                 64
tower_kills                     63
damage_taken                    61
stun_duration                   52
healing                         44
```

每个英雄至少有 8 个空槽，不存在无解的英雄。

#### 约束

1. **同一英雄的 3 条任务不得出现重复指标。** 32 个 `hero_damage` 冲突必须各换掉一条。
2. **`roshan_kills` 只做通用任务，不做英雄专属。** 单局肉山击杀归属唯一，做成英雄任务时能否完成基本靠运气而非英雄操作。
3. **小整数指标的三档由 3.3 的加法规则保证互不相同**，任务池不需要为此调整 target。

#### 差异化的降级要接受

原本靠「魔法/物理/纯粹伤害 + 六种控制」表达英雄定位，现在莉娜与幽鬼的任务都会是 `hero_damage`，只有数值不同。

损失比看上去小：`stun_duration` 保留（52 个英雄可用）覆盖控制型英雄，`healing`（44）覆盖辅助，`damage_taken`（61）覆盖坦克，`last_hits` / `total_gold_earned` 覆盖 Farm 核。剩下的靠 `heroName` 限定加数值高低区分。

#### 该工作项还需一并决定

- **通用任务的数量与难度档划分**：原 19 条一一对应 19 个 metric，现在只剩 10 个 metric，可能需要同一 metric 配多个难度档
- **英雄专属任务规模**：保持 127 × 3 = 381 条，还是降到 127 × 1（12.1 若发现冷门英雄样本量不足，127 × 1 需要的样本更少）
- **数值标定**：原 `target` 全部按跨局累积标定（如 `general_hero_damage: 500000`），改成单局达标后按 12.1 的分位数重标（例如 2★ = P50，1★ = P30，3★ = P75）

工作量约一天，瓶颈仍是 12.1 的数据积累。

### 12.3 机制实现（本 spec 覆盖的部分）

第 6~11 节描述的数据模型、接口契约、服务端逻辑、测试策略。**不依赖 12.2**——机制与任务池内容正交，可以用现有任务池的占位数值先实现并测试，等 12.2 产出后替换 `config/tasks.ts` 即可。

唯一需要提前定的参数：**每天轮数**，默认保持 3。

## 13. 客户端需要同步的改动（game 仓库）

### 13.1 保留

- Panorama UI 全套（页面、候选卡、星级徽章、历史面板、结算页积分）
- 三语本地化资源——按 10 个 metric 重新裁剪模板
- `daily-challenge-controller.ts` 的 UI 交互与状态管理部分

### 13.2 新增

- **模式门控**：按 3.5 判定本局是否启用；禁用时不展示候选、不判定、不计分、不上报
- **指标读取**：一个函数，按 `metric` 分发到对应的 `PlayerResource` 调用，局内展示与结算判定时各调一次
- **达标判定**：用服务端下发的 `metric` / `target` / `heroName` 在局内判定，英雄不匹配的候选在 UI 上禁用
- **计分**：达标后把 `rewardSeasonPoint` 计入本局 `battlePoints`
- `game-end.ts`：`players[i]` 多发 `dailyChallengeTaskId` / `stuns` / `roshanKills`，顶层多发 `dailyChallengeDayId`

### 13.3 删除全部采集模块

10 个指标全部走 `PlayerResource` 原生 API，采集代码归零：

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

### 13.4 其余删除

- `daily-challenge-match-context.ts` 的挑战日顺序保护、`confirmMatchStart()`
- `shouldReplaceDailyChallengeSnapshot()` 及 VScript store / Panorama client 两层防回退
- `daily-challenge-snapshot.ts` 的独立接口调用（accept / refresh / view / snapshot）
- `DailyChallengeSnapshotVersion` 类型与全部版本兼容分支

## 14. 现有实现（PR #1040 / #2310）的去留

### 14.1 跨阶段复用（约 3300 行，其中 2837 是任务池数据）

| 文件 | 行数 | 处置 |
| --- | --- | --- |
| `config/tasks.ts` | 2837 | **保留文件结构与 127 英雄清单**，但内容需要重新设计——404 条里 204 条用的是被删指标。见 12.2，独立工作项 |
| `config/tasks.spec.ts` | 234 | 保留大部分守卫，删掉 `dataVersion` 断言和共同任务相关断言 |
| `services/daily-challenge-generation.service.ts` | 134 | **核心算法直接复用**（FNV-1a、seeded pick、`pickStar`、`getMetricCategory`）。删掉 `seenTaskIds` 回退后约 110 行 |
| `services/daily-challenge-generation.service.spec.ts` | 183 | 同上，按新签名调整 |
| `services/daily-challenge-personal-config.ts` + spec | 136 | 保留星级目标解析（含毫秒取整） |
| `types/daily-challenge.types.ts` | 137 | 保留 `ChallengeScope` / `ChallengeMetric` enum，删掉三张 metric 映射表和两个版本常量 |
| `util/challenge-day-clock.service.ts` | — | 保留，删掉 `closesAt` 和 120 分钟宽限 |

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

### 14.5 PR 处理建议

**不要在 PR #1040 上改**，另开 Phase1 PR 从 `develop` 切：

- 后端保留比例约 30%，其中大头还是任务池数据，实际等于重写
- #1040 在贡献者的 fork 分支上，在别人分支上做这种规模的重写不合适
- #1040 保持可读状态，Phase2/3 开工时还能回来查 14.2 / 14.3 里那些算法

game PR #2310 的情况不同——采集模块和 UI 都保留，改动集中在"删掉独立接口调用和防回退、新增本地判定与计分"。可以考虑在原分支上迭代，或另开分支 cherry-pick。
