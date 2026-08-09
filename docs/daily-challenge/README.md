# 每日挑战后端文档索引

本目录只保留每日挑战系统的最终后端资料。配套游戏端实现位于 `windy10v10ai/game` 仓库的同名功能 PR；两个 PR 必须配套评审和部署，任一侧单独上线都不能形成完整功能。

| 文档 | 用途 |
| --- | --- |
| [后端实施说明](backend-implementation.md) | NestJS 模块、比赛结算、奖励、共同进度和故障隔离 |
| [接口协议](api-contract.md) | 玩家接口、配置接口、`/game/start` 与 `/game/end` 扩展 |
| [数据模型与状态机](data-model-and-state-machine.md) | Firestore 集合、冻结快照、幂等和日终排名 |
| [配置与运营手册](configuration-and-operations.md) | 正式任务池、积分参数、发布、回滚和运营检查 |
| [后端测试与验收](backend-verification.md) | 静态、Emulator、API 与跨仓库联调门禁 |

## 代码真相源

- 模块入口：`api/src/daily-challenge/daily-challenge.module.ts`
- 玩家与管理接口：`api/src/daily-challenge/controllers/`
- DTO、类型和校验：`api/src/daily-challenge/dto/`、`types/`、`validators/`
- 生成、进度、结算、奖励和连续完成：`api/src/daily-challenge/services/`
- Firestore 实体与索引：`api/src/daily-challenge/entities/`、`firestore.indexes.json`
- 最终任务池：`config/daily-challenge/daily-challenge-hero-pool-v1.json`
- 本地 Emulator 测试 GUI：`tools/daily-challenge-local/`

## 已冻结的产品规则

- 每个挑战日一个共同任务；每名玩家最多完成三轮个人任务。
- 每轮三个候选固定为两个通用任务和一个英雄专属任务；每个候选独立随机星级，允许同一轮出现混合星级或三个同星。
- 一、二、三星默认奖励分别为 80、100、120 赛季积分；刷新消耗会员积分，所有任务奖励都不发会员积分。
- 个人任务正常赛后结算达标即发奖；共同任务按日冻结排名并在次日自动发奖。
- 共同任务贡献不依赖玩家是否接取个人任务；个人任务未接取不累计进度。
- 挑战日边界复用会员每日积分赠送的刷新边界。

## 验证边界

单元测试、构建和 Firestore Emulator 验证不能替代 Dota 游戏内实测。最终验收必须结合配套 game PR 的 `docs/daily-challenge/gameplay-verification.md`。本地 AI vs AI 与线上 AI 是否完全一致尚未证明，不可把本地样本直接当作线上平衡结论。
