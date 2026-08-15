# 每日挑战 API 协议

## 1. 通用约定

- JSON 使用 UTF-8。
- `schemaVersion` 当前为 `2`。
- `dayId` 为服务器本地挑战日，格式 `YYYY-MM-DD`。
- `requestId` 由调用方生成，用于接取、刷新和查看操作的幂等重试。
- 时长指标统一以毫秒传输；Game 侧负责显示为秒。
- `seasonPoint`、`rewardSeasonPoint` 均为赛季积分；`costMemberPoint` 为会员积分消耗。
- 任务文案由 Game 侧根据 `taskId`、`scope`、`metric` 和 `heroName` 本地化，API 不返回 `title` 或 `description`。

## 2. 任务快照

```json
{
  "assignmentId": "2026-08-09-483215844-r1-hero_lina_1-0",
  "taskId": "hero_lina_1",
  "scope": "personal_hero",
  "configVersion": 1,
  "star": 2,
  "round": 1,
  "totalRounds": 3,
  "metric": "magical_damage",
  "heroName": "npc_dota_hero_lina",
  "unit": "damage",
  "target": 500000,
  "progress": 0,
  "rewardSeasonPoint": 100
}
```

共同任务不包含 `star`、`round` 和 `totalRounds`，其 `rewardSeasonPoint` 为 `0`；最终共同奖励由挑战日冻结的贡献档位决定。

## 3. 玩家接口

### 3.1 比赛开始快照

```http
GET /daily-challenge/match-start?steamIds=483215844,123456789
```

```json
{
  "dayId": "2026-08-09",
  "matchStartedAt": "2026-08-09T10:00:00.000Z",
  "dailyChallenges": []
}
```

`matchStartedAt` 必须随该局保存，并在 `/game/end` 中原样回传，用于确定挑战日归属。

### 3.2 玩家快照

```http
GET /daily-challenge/snapshot?steamId=483215844
```

主要字段：

| 字段                                  | 含义                                     |
| ------------------------------------- | ---------------------------------------- |
| `schemaVersion`                       | 快照协议版本                             |
| `steamId` / `dayId`                   | 玩家与挑战日                             |
| `startsAt` / `endsAt`                 | 挑战日窗口                               |
| `updatedAt`                           | 客户端判断同日响应新旧的时间戳           |
| `globalTask` / `globalRewardTiers`    | 当日共同任务与奖励档位                   |
| `candidates`                          | 当前轮最多 3 个候选                      |
| `acceptedTask`                        | 当前已接任务，未接时省略                 |
| `completedTasks`                      | 当天已完成的个人任务                     |
| `needsSelection`                      | 是否需要选择下一任务                     |
| `refresh`                             | 会员资格、免费刷新、已用次数和下一次费用 |
| `streak`                              | 连续完成进度和下一里程碑                 |
| `recentRewards` / `unreadRewardCount` | 最近奖励和未读数量                       |

### 3.3 接取个人任务

```http
POST /daily-challenge/accept?steamId=483215844
Content-Type: application/json
```

```json
{
  "schemaVersion": 2,
  "dayId": "2026-08-09",
  "assignmentId": "候选任务实例 ID",
  "requestId": "accept-483215844-20260809-001"
}
```

成功返回：

```json
{
  "code": "accepted",
  "snapshot": {},
  "costMemberPoint": 0
}
```

### 3.4 刷新候选

```http
POST /daily-challenge/refresh?steamId=483215844
Content-Type: application/json
```

```json
{
  "schemaVersion": 2,
  "dayId": "2026-08-09",
  "requestId": "refresh-483215844-20260809-001"
}
```

只有有效会员可刷新；当天第一次刷新免费，之后按 `refreshCostsMemberPoint` 扣除会员积分。已接取任务、当日三轮已完成或超过刷新次数时拒绝刷新。

成功返回 `code`、最新 `snapshot`、本次 `costMemberPoint`，付费或免费刷新均可返回 `memberPointBalance`。

### 3.5 标记奖励已查看

```http
POST /daily-challenge/view?steamId=483215844
Content-Type: application/json
```

请求字段为 `schemaVersion`、`dayId`、`requestId`。成功返回 `code: "viewed"` 和最新快照。

## 4. `/game/start` 集成

`POST /game/start` 在原有响应中可附加：

```json
{
  "matchStartedAt": "2026-08-09T10:00:00.000Z",
  "dailyChallenges": [],
  "pointInfo": []
}
```

处理顺序：

1. 复用会员每日积分流程；
2. 补做已经结束但尚未完成的挑战日结算；
3. 把已入账但未展示的每日挑战奖励加入 `pointInfo`；
4. 返回本局开始时的玩家挑战快照。

每日挑战异常只记录警告，不阻断基础开局响应。

## 5. `/game/end` 集成

`POST /game/end` 请求可携带：

```json
{
  "dailyChallenge": {
    "schemaVersion": 2,
    "dataVersion": 2,
    "dayId": "2026-08-09",
    "matchStartedAt": "2026-08-09T10:00:00.000Z",
    "players": [
      {
        "steamId": 483215844,
        "normallySettled": true,
        "acceptedAssignmentId": "任务实例 ID",
        "personalMetrics": [{ "metric": "healing", "value": 300000 }],
        "globalMetrics": [{ "metric": "roshan_kills", "value": 1 }]
      }
    ]
  }
}
```

响应统一为对象：

```json
{
  "result": "OK",
  "dailyChallengeRewards": [
    {
      "steamId": 483215844,
      "source": "personal",
      "seasonPoint": 100,
      "dayId": "2026-08-09",
      "assignmentId": "任务实例 ID"
    }
  ],
  "dailyChallenges": []
}
```

无个人任务奖励或快照时，对应可选字段省略，但不会退回字符串响应。

## 6. 进度接纳规则

- `dayId` 必须与 `matchStartedAt` 所属挑战日一致。
- 玩家必须属于基础结算认可的有效玩家，且不能是断开连接玩家。
- `normallySettled` 必须为 `true`。
- 个人任务必须在比赛开始后 10 分钟内接取，且 `acceptedAssignmentId` 必须匹配。
- 英雄专属任务要求该局英雄与任务 `heroName` 一致。
- 每个指标在对应数组中必须恰好出现一次，数值必须为非负安全整数且不超过服务端上限。
- 最低 `dataVersion` 由服务端按 `metric` 决定，不是任务快照字段。
- 共同任务不要求玩家接取个人任务，但仍要求正常结算、有效玩家、指标和任务实例匹配。
- 同一比赛、玩家和开始时间使用固定账本 ID，重试不会重复累计或重复发奖。

## 7. 常见冲突码

业务冲突通过现有异常响应返回，常见 code 包括：

- `day_closed`
- `assignment_expired`
- `already_selected`
- `not_member`
- `refresh_limit_reached`
- `insufficient_member_points`
