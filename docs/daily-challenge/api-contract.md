# 每日挑战接口协议

## 1. 通用约定

- JSON 请求与响应使用 UTF-8。
- `schemaVersion` 当前固定为 `2`；版本 `1` 的玩家快照/操作请求不再接受。
- `dayId` 格式为 `YYYY-MM-DD`，由服务器挑战日时钟生成。
- `requestId` 由调用方生成，在同一玩家、挑战日和操作类型内用于幂等重试。
- SteamID 通过查询参数传入，必须是正整数。
- 任务时长指标以毫秒传输；界面负责格式化为秒。
- 奖励字段 `seasonPoint` 和 `rewardSeasonPoint` 均指赛季积分；`costMemberPoint` 指会员积分消耗。

## 2. 玩家接口

### 2.1 获取比赛开始快照

```http
GET /daily-challenge/match-start?steamIds=483215844,123456789
```

响应：

```json
{
  "dayId": "2026-08-06",
  "matchStartedAt": "2026-08-06T10:00:00.000Z",
  "dailyChallenges": []
}
```

`matchStartedAt` 必须原样保存到该局挑战上下文，并在 `/game/end` 的 `dailyChallenge.matchStartedAt` 中回传。游戏端已经确认较新的 `dayId` 后，必须拒绝旧挑战日迟到的 match-start 响应，不能让比赛归属时间或当日接取状态回退。

### 2.2 获取单个玩家快照

```http
GET /daily-challenge/snapshot?steamId=483215844
```

返回 `DailyChallengePlayerSnapshotDto`。

主要字段：

| 字段                  | 含义                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| `schemaVersion`       | 快照协议版本，当前为 `2`                                                 |
| `steamId`             | 玩家 SteamID                                                             |
| `dayId`               | 当前挑战日                                                               |
| `updatedAt`           | 玩家快照更新时间（ISO 8601）；客户端用它拒绝同一挑战日内迟到的旧异步响应 |
| `status`              | 挑战日状态                                                               |
| `startsAt` / `endsAt` | 挑战日起止时间                                                           |
| `globalTask`          | 当日共同任务 assignment 快照                                             |
| `globalRewardTiers`   | 共同任务档位百分比和积分                                                 |
| `candidates`          | 最多三条个人候选                                                         |
| `acceptedTask`        | 已接个人任务；未接时省略                                                 |
|
eedsSelection`      | 是否需要选择任务                                                         |
| `refresh`             | 会员、免费刷新、已用次数、剩余次数和下次费用                             |
| `streak`              | 当前连续天数、循环目标和下一里程碑                                       |
| `unreadRewardCount`   | 未查看奖励数量                                                           |
| `recentRewards`       | 最近最多 20 条奖励记录                                                   |

`updatedAt` 只用于快照新旧排序，不改变挑战日归属；滚动部署期间客户端兼容缺少该字段的旧响应，但在已经持有带 `updatedAt` 的同日快照后会拒绝无时间戳的迟到响应。

任务快照字段：

```json
{
  "assignmentId": "挑战日内唯一实例ID",
  "taskId": "配置任务ID",
  "revision": 1,
  "configVersion": 7,
  "star": 2,
  "round": 1,
  "totalRounds": 3,
  "scope": "personal_general",
  "metric": "hero_damage",
  "heroName": "npc_dota_hero_lina",
  "unit": "damage",
  "minDataVersion": 1,
  "title": { "cn": "...", "en": "...", "ru": "..." },
  "description": { "cn": "...", "en": "...", "ru": "..." },
  "target": 500000,
  "progress": 0,
  "rewardSeasonPoint": 100
}
```

### 2.3 接取个人任务

```http
POST /daily-challenge/accept?steamId=483215844
Content-Type: application/json
```

```json
{
  "schemaVersion": 2,
  "dayId": "2026-08-06",
  "assignmentId": "候选任务实例ID",
  "requestId": "accept-483215844-20260806-001"
}
```

成功响应：

```json
{
  "code": "accepted",
  "snapshot": {},
  "costMemberPoint": 0
}
```

### 2.4 刷新候选任务

```http
POST /daily-challenge/refresh?steamId=483215844
Content-Type: application/json
```

```json
{
  "schemaVersion": 2,
  "dayId": "2026-08-06",
  "requestId": "refresh-483215844-20260806-001"
}
```

成功响应：

```json
{
  "code": "refreshed",
  "snapshot": {},
  "costMemberPoint": 10,
  "memberPointBalance": 999990
}
```

免费刷新时 `costMemberPoint` 为 `0`。

### 2.5 标记奖励已查看

```http
POST /daily-challenge/view?steamId=483215844
Content-Type: application/json
```

```json
{
  "schemaVersion": 2,
  "dayId": "2026-08-06",
  "requestId": "view-483215844-20260806-001"
}
```

成功响应 `code` 为 `viewed`，并返回更新后的完整快照。

### 2.6 操作冲突

业务冲突使用 HTTP `409`，响应体包含稳定 `code`：

| 错误码                       | 含义                      |
| ---------------------------- | ------------------------- |
| `already_selected`           | 当天已经接取个人任务      |
| `day_closed`                 | 挑战日不再接受操作        |
| `insufficient_member_points` | 会员积分不足              |
| `invalid_candidate`          | assignment 不属于当前候选 |
|
ot_member`                 | 当前玩家不是有效会员      |
| `refresh_limit_reached`      | 当日付费刷新次数已用完    |

客户端展示本地化文案时应以 `code` 映射，不应依赖服务端英文消息。

## 3. 既有游戏接口扩展

### 3.1 `/game/start`

基础开局响应增加可选字段：

```json
{
  "players": [],
  "pointInfo": [],
  "matchStartedAt": "2026-08-06T10:00:00.000Z",
  "dailyChallenges": []
}
```

`pointInfo` 可包含：

```json
{
  "steamId": 483215844,
  "title": { "cn": "每日挑战完成奖励", "en": "Daily Challenge Reward" },
  "seasonPoint": 100,
  "dailyChallengeReward": {
    "dayId": "2026-08-05",
    "source": "personal",
    "configVersionId": "v1",
    "configVersion": 1,
    "assignmentId": "...",
    "contributionTier": "top",
    "streakDays": 7,
    "taskSnapshot": {}
  }
}
```

可选字段按奖励来源出现：个人奖励包含 assignment 与任务快照；共同奖励包含档位；连续奖励包含连续天数。

### 3.2 `/game/end`

游戏结算请求增加可选 `dailyChallenge`：

```json
{
  "schemaVersion": 2,
  "dataVersion": 2,
  "dayId": "2026-08-06",
  "matchStartedAt": "2026-08-06T10:00:00.000Z",
  "players": [
    {
      "steamId": 483215844,
      "normallySettled": true,
      "acceptedAssignmentId": "个人任务实例ID",
      "personalMetrics": [{ "metric": "hero_damage", "value": 500000 }],
      "globalMetrics": [{ "metric": "bot_kills", "value": 75 }]
    }
  ]
}
```

协议要求：

- `dataVersion` 当前最大为 `2`；
- 指标只能使用协议枚举；
- 所有值必须是非负整数；
- 时长指标使用毫秒；
- 低于某指标 `minDataVersion` 的客户端贡献不被采用；
- 超过单局安全上限的指标整项拒绝，不做截断；
- 未正常结算玩家的数据不落库；
- `dailyChallenge` 缺失时，基础游戏结算照常执行。

未提交 `dailyChallenge`，或每日挑战结果和结算后快照都不可用时，响应保持既有字符串：

```json
"OK"
```

只要存在本局个人奖励或结算后玩家快照，响应改为对象；两个扩展字段均为可选：

```json
{
  "result": "OK",
  "dailyChallengeRewards": [
    {
      "steamId": 483215844,
      "source": "personal",
      "seasonPoint": 100,
      "dayId": "2026-08-06",
      "assignmentId": "个人任务实例ID"
    }
  ],
  "dailyChallenges": [
    {
      "schemaVersion": 2,
      "steamId": 483215844,
      "dayId": "2026-08-06",
      "updatedAt": "2026-08-06T10:45:00.000Z",
      "completedRoundCount": 3,
      "currentRound": 3,
      "totalRounds": 3,
      "candidates": [],
      "needsSelection": false
    }
  ]
}
```

`dailyChallengeRewards` 只用于本局即时个人奖励展示。该奖励已经在后端事务中入账，客户端不得再次请求发奖。相同 `matchId + steamId` 重试不会重复入账，但后端会回显同一笔奖励，使首次响应丢失后仍能恢复赛后积分明细。

`dailyChallenges` 是通过基础结算且未断开玩家的结算后完整快照，用于立即同步正式进度、轮次推进、下一轮候选和三轮完成态。客户端必须按 `dayId + updatedAt` 排序；较旧响应不能覆盖已经接受的新快照。快照读取失败不影响基础结算或已经提交的挑战进度，只会省略 `dailyChallenges`。每日挑战进度处理异常时，基础结算继续返回，但不携带每日挑战奖励或结算后快照。
## 4. 指标枚举

| 指标                  | 单位        | 最低数据版本 |
| --------------------- | ----------- | -----------: |
| `hero_damage`         | damage      |            1 |
| `physical_damage`     | damage      |            2 |
| `magical_damage`      | damage      |            2 |
| `pure_damage`         | damage      |            2 |
| `damage_taken`        | damage      |            1 |
| `healing`             | damage      |            1 |
| `kills`               | count       |            1 |
| `assists`             | count       |            1 |
| `last_hits`           | count       |            1 |
| `tower_kills`         | count       |            1 |
| `bot_kills`           | count       |            2 |
| `roshan_kills`        | count       |            2 |
| `stun_duration_ms`    | millisecond |            2 |
| `slow_duration_ms`    | millisecond |            2 |
| `root_duration_ms`    | millisecond |            2 |
| `silence_duration_ms` | millisecond |            2 |
| `taunt_duration_ms`   | millisecond |            2 |
| `break_duration_ms`   | millisecond |            2 |
| `debuff_duration_ms`  | millisecond |            2 |

## 5. 配置接口

```http
GET  /admin/daily-challenge/config/draft
PUT  /admin/daily-challenge/config/draft
POST /admin/daily-challenge/config/publish
GET  /admin/daily-challenge/config/published
GET  /admin/daily-challenge/config/versions
GET  /admin/daily-challenge/config/versions/:versionId
POST /admin/daily-challenge/config/versions/:versionId/rollback
```

写草稿、发布和回滚必须提供：

```http
x-admin-actor: <operator>
```

- `PUT draft` 请求体是完整 `DailyChallengeConfigSnapshot`；保存后返回配置和校验问题。
- `POST publish` 发布当前草稿；版本文档 ID 为 `v${config.version}`。
- `GET published` 返回当前发布指针指向且通过读取校验的版本。
- `rollback` 只把 `published` 指针移动到历史版本并记录审计，不创建复制版本。

当前没有独立运营页面，配置通过这些 API 或 Swagger 管理。

## 6. 快照协议 v2 与三轮字段

`DailyChallengePlayerSnapshotDto` 在 v2 中新增并要求以下字段：

| 字段                  | 含义                                             |
| --------------------- | ------------------------------------------------ |
| `totalRounds`         | 当天冻结的总轮数，默认值为 3                     |
| `currentRound`        | 当前轮次，从 1 开始；完成当天后保持为最后一轮    |
| `completedRoundCount` | 已完成轮数                                       |
| `completedTasks`      | 已完成各轮任务的冻结快照，用于奖励补偿与历史展示 |

个人候选、已接任务和已完成任务快照冻结 `configVersion`、`star`、`round`、`totalRounds`、`target` 与 `rewardSeasonPoint`。共同任务只冻结 `configVersion`、目标与奖励档位，不携带星级或个人轮次。

个人任务 `assignmentId` 格式包含轮次和刷新序号：

```text
{dayId}-{steamId}-round-{round}-refresh-{refreshIndex}-{taskId}
```

完成第 1/2 轮后，后端返回新一轮三候选并清空 `acceptedTask`；完成第 3 轮后 `candidates=[]`、`acceptedTask` 省略并设置 `completedAt`。相同 `matchId + steamId` 的 `/game/end` 重试读取同一比赛 ledger，不能再次发奖、推进轮次或生成另一组候选；如果该 ledger 已记录 `personalRewardLedgerId`，响应会回显同一笔个人奖励供赛后展示。

刷新额度是整日共享状态：会员每天一次免费刷新，付费刷新总次数等于 `refreshCostsMemberPoint.length`（当前配置五次）。刷新整组三候选；跨轮保留 `freeRefreshUsed`、`paidRefreshesUsed` 与 `refreshIndex`，接取后禁止刷新。
