# 每日挑战配置与运维

## 1. 配置位置

唯一配置文件：

```text
api/src/daily-challenge/config/tasks.ts
```

任务池不再保留 JSON 副本，不通过 Firebase Console 或 admin API 发布。所有修改走代码评审、测试、构建和正常部署。

## 2. 任务池

当前共 404 个任务：

| 范围                            | 数量 |
| ------------------------------- | ---: |
| 通用个人任务 `personal_general` |   19 |
| 英雄专属任务 `personal_hero`    |  381 |
| 全服共同任务 `global`           |    4 |

任务定义只保留实际运行需要的字段：

```ts
interface DailyChallengeTaskDefinition {
  id: string;
  scope: ChallengeScope;
  metric: ChallengeMetric;
  target: number;
  starTargets?: Record<1 | 2 | 3, number>;
  heroName?: string;
}
```

- `target` 是二星基准目标，也是共同任务的实际目标。
- `starTargets` 只在某任务需要显式覆盖各星级目标时使用。
- `heroName` 仅用于英雄专属任务。
- `unit`、最低数据版本和单局上限由 `metric` 的服务端映射决定。
- 标题、描述和英雄名显示由 Game 侧本地化资源决定。

禁止重新加入 `revision`、`enabled`、`title`、`description`、任务级 `minDataVersion`、`weight`、任务级奖励、标签或动态共同目标策略等未使用字段。

## 3. 全局数值配置

`DAILY_CHALLENGE_CONFIG` 当前包含：

| 字段                             | 当前用途                                           |
| -------------------------------- | -------------------------------------------------- |
| `id` / `version`                 | 冻结到挑战日和玩家快照，协议不兼容修改时递增版本   |
| `personalRoundsPerDay`           | 每日个人任务轮数，当前 3                           |
| `personalStarRewards`            | 一、二、三星赛季积分，当前 80/100/120              |
| `personalStarWeights`            | 三个候选分别抽取星级时的权重                       |
| `personalDefaultStarMultipliers` | 未配置 `starTargets` 时的目标倍率，当前 0.75/1/1.5 |
| `tasks`                          | 404 条代码任务池                                   |
| `globalRewardTiers`              | 共同排名百分比和赛季积分                           |
| `refreshCostsMemberPoint`        | 免费刷新后的付费价格表；数组长度即每日付费上限     |
| `streakMilestones`               | 连续完成里程碑与赛季积分                           |

当前共同奖励：前 10% 为 100，随后 30% 为 90，其余有效贡献者为 80 赛季积分。共同任务只有达标后才发奖。

## 4. 修改任务

1. 在 `DAILY_CHALLENGE_TASKS` 中新增、删除或修改任务。
2. 保证 `id` 唯一且稳定；已经上线的任务如只调整目标，优先保留原 ID。
3. 英雄专属任务必须填写正确 `heroName`，并确认 Game 侧存在对应英雄文案。
4. 纯粹伤害、控制等专属任务必须先确认当前项目中的英雄技能与采集指标确实支持。
5. 如新增 `metric`，必须同时更新：
   - `ChallengeMetric`；
   - `DAILY_CHALLENGE_METRIC_UNIT`；
   - `DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION`；
   - `DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION`；
   - Game 侧采集、三语模板和协议版本。
6. 如任务文案或占位符变化，只改 Game 仓库三语资源，不把文案复制回后端。

## 5. 修改积分与刷新价格

- 调整个人积分：修改 `personalStarRewards`。
- 调整星级出现概率：修改 `personalStarWeights`，不得依赖权重总和为 100。
- 调整默认难度：修改 `personalDefaultStarMultipliers`，或为单条任务配置 `starTargets`。
- 调整共同档位：修改 `globalRewardTiers`。
- 调整会员刷新：修改 `refreshCostsMemberPoint`；当天第一次免费刷新不在数组中。
- 调整连续奖励：修改 `streakMilestones`，天数必须递增。

为控制积分膨胀，任何积分或目标改动都应同时估算：每日最多个人积分、共同奖励覆盖率、连续奖励摊销和会员积分消耗。

## 6. 发布前检查

在 `api` 目录运行：

```powershell
npm test -- --runInBand
npm run lint
npm run build
git diff --check
```

同时检查：

- `tasks.spec.ts` 仍为 404 个唯一任务，数量变化必须是有意修改；
- 每轮生成仍为 2 个通用任务 + 1 个英雄专属任务；
- 个人星级奖励与 Game UI 展示一致；
- Game 与 Firebase 的 `schemaVersion`、`dataVersion`、metric 和本地化模板同步；
- Firestore indexes 已覆盖查询；
- 没有重新引入 JSON 任务池、admin 配置接口或后端任务文案。

## 7. 回滚

配置与任务池随代码发布。回滚使用 Git revert 并重新部署 Firebase/API；不要在 Firestore 手工写入第二份配置。已经创建的挑战日和玩家状态保存冻结快照，回滚时必须确认新旧 `configVersion` 与协议兼容。
