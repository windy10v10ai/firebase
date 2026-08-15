# 每日挑战后端实现

## 1. 模块边界

`DailyChallengeModule` 只注册玩家接口、Firestore 实体和每日挑战业务服务。挑战日边界位于低层共享模块：

```text
ChallengeDayClockModule
├─ MembersModule
└─ DailyChallengeModule
```

会员模块不依赖每日挑战模块。

## 2. 代码配置

`api/src/daily-challenge/config/tasks.ts` 是唯一任务与数值配置真相源：

- `DAILY_CHALLENGE_TASKS`：404 个类型约束任务；
- `DAILY_CHALLENGE_CONFIG`：版本、每日轮数、星级奖励/权重/倍率、共同奖励档位、刷新价格和连续里程碑。

后端不读取任务池 JSON，不提供 admin 配置 controller/service/store/validator，也不从 Firestore 发布或回滚任务版本。任务文案由 Game 侧三语资源维护。

## 3. 挑战日与生成

- `ChallengeDayClockService` 使用服务器本地零点作为挑战日开始，结束后保留 120 分钟关闭宽限期。
- `DailyChallengeDayService` 按 `dayId` 幂等创建挑战日，冻结配置 ID/版本、一个共同任务和共同奖励档位。
- `DailyChallengeGenerationService` 使用稳定种子生成任务：共同任务每天一个；个人每轮两个通用任务和一个当前英雄任务。
- 三个个人候选分别抽取星级，可全部相同；优先选择玩家当天未见任务，任务池耗尽后允许回退复用。
- 个人目标优先使用任务显式 `starTargets`；未配置时使用一、二、三星默认倍率 0.75、1、1.5。毫秒目标按整秒取整。

## 4. 玩家状态

`PlayerDailyChallenge` 按 `dayId + steamId` 保存：

- 当日共同任务与奖励档位；
- 当前轮、已完成轮数、候选、已接任务和进度；
- 当天已见任务、刷新次数和冻结的刷新价格；
- 最近更新时间、未读奖励数和连续完成状态。

接取、刷新和查看操作使用 `daily_challenge_operation_ledger` 幂等保存结果。玩家重复发送同一 `requestId` 时返回第一次结果，不重复扣积分或修改状态。

## 5. 比赛进度

`DailyChallengeProgressService.applyGameEnd` 负责：

1. 校验比赛开始时间与挑战日；
2. 过滤无效玩家、断开连接和非正常结算；
3. 按指标协议版本和单局合理上限校验贡献；
4. 在同一事务中写入比赛账本、个人状态、共同贡献和个人奖励；
5. 个人任务完成后按星级立即增加赛季积分，并生成下一轮候选；
6. 第三轮完成后更新连续完成状态。

个人任务只有在比赛开始后 10 分钟内接取才累计。共同任务与个人接取无关；只要玩家有效参与并正常结算即可贡献。

## 6. 奖励与结算

- 个人奖励：完成任务时事务内立即发放，默认 80/100/120 赛季积分。
- 共同奖励：挑战日关闭后冻结贡献，达标时按贡献降序和 SteamID 升序生成排名；档位边界并列进入较高档。
- 连续奖励：完成当天三轮后更新连续天数；中断归零，达到最高里程碑后开始新循环。
- 奖励账本 ID 固定，写入账本和玩家赛季积分在同一事务中完成，防止重复发放。
- 通知状态为 `pending -> notified -> viewed`。积分已在奖励事务中入账，`/game/start` 只负责把待展示奖励放入现有 `pointInfo`。

## 7. Firestore 集合

| 集合                                   | 用途                             |
| -------------------------------------- | -------------------------------- |
| `daily_challenge_days`                 | 挑战日、共同任务、冻结和结算状态 |
| `player_daily_challenges`              | 玩家当日个人状态和冻结快照       |
| `daily_challenge_global_contributions` | 玩家共同任务累计贡献             |
| `daily_challenge_global_rankings`      | 冻结后的共同排名和奖励档位       |
| `daily_challenge_match_ledger`         | 单局进度幂等账本                 |
| `daily_challenge_operation_ledger`     | 接取、刷新、查看操作幂等账本     |
| `daily_challenge_reward_ledger`        | 个人、共同、连续奖励与通知状态   |

## 8. 故障隔离

- `/game/start` 获取快照、补结算或领取奖励通知失败时记录 warning，不阻断基础开局。
- `/game/end` 每日挑战进度或快照失败时记录 warning，基础对局结算仍返回统一对象。
- 共同任务冻结和发奖可以由后续 `/game/start` 的 reconcile 补做，所有步骤必须保持幂等。

## 9. 测试重点

- 稳定任务生成、2 通用 + 1 英雄、独立星级和刷新去重；
- 10 分钟接取窗口、正常结算、英雄匹配、数据版本和异常贡献；
- 个人奖励事务、共同贡献冻结、并列档位、连续循环；
- 会员免费/付费刷新和积分不足；
- `/game/start`、`/game/end` 故障隔离和统一返回对象；
- 会员与每日挑战共用挑战日边界。
