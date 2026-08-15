# 每日挑战后端最终文档

> 最后核对：2026-08-09。

本目录只保留每日挑战上线所需的最终需求、接口、实现和配置说明。配套 Game PR 负责 UI、三语文案和比赛侧数据采集；Firebase PR 负责任务生成、进度、奖励、结算和持久化。两侧必须按同一协议配套发布。

## 文档

| 文档                                          | 内容                                                |
| --------------------------------------------- | --------------------------------------------------- |
| [接口协议](api-contract.md)                   | 玩家接口、`/game/start`、`/game/end` 和任务快照字段 |
| [后端实现](backend-implementation.md)         | 模块职责、挑战日、进度、结算、幂等和 Firestore 数据 |
| [配置与运维](configuration-and-operations.md) | 代码任务池、积分参数、修改流程和发布检查            |

## 最终产品规则

- 每个挑战日生成 1 个全服共同任务。
- 每名玩家每天最多完成 3 轮个人任务；每轮提供 2 个通用任务和 1 个当前英雄专属任务，玩家三选一。
- 三个候选的星级独立随机，允许混合星级，也允许三个同星。
- 玩家接取后才累计个人进度；比赛开始后 10 分钟内接取才计入该局。
- 一、二、三星默认奖励为 80、100、120 赛季积分；个人任务完成后立即发放并进入下一轮。
- 会员每天第一次刷新免费，之后按代码配置消耗会员积分；每日付费刷新上限由价格数组长度决定，当前为 5 次。
- 共同任务统计所有正常结算玩家的有效贡献，不要求接取个人任务；挑战日结束后冻结排名，达标后按贡献档位发赛季积分。
- 连续完成中断后从第一天重新计算；达到最高里程碑后进入下一循环。
- 挑战日边界与会员每日积分共用 `ChallengeDayClockService`；比赛按开始时间归属挑战日。

## 真相源

- 任务池和奖励参数：`api/src/daily-challenge/config/tasks.ts`
- 任务定义类型：`api/src/daily-challenge/types/daily-challenge-config.types.ts`
- 指标、单位和数据版本：`api/src/daily-challenge/types/daily-challenge.types.ts`
- 玩家接口：`api/src/daily-challenge/controllers/daily-challenge-game.controller.ts`
- 游戏开始/结束集成：`api/src/game/game.controller.ts`
- 共享挑战日时钟：`api/src/util/challenge-day-clock.service.ts`
- UI 三语任务文案：Game 仓库 `addon_*.txt`

后端不再提供任务配置管理接口，不从 JSON 或 Firestore 动态加载任务池，也不下发任务标题和描述。

## 验证边界

单元测试、lint 和 Nest 构建只能证明后端静态与逻辑层结果，不能替代 Dota 游戏内结算、UI 和线上 AI 行为验证。
