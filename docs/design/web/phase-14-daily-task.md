# 批次 14：每日任务与 30 天历史

依赖的接口在 [windy10v10ai/game#2435](https://github.com/windy10v10ai/game/issues/2435) 的「阶段 3.5」，**尚未实现**；代发通道的设计与实测证据见 game 仓库的 `src/vscripts/api/README.md`。

## 背景

每日任务到目前为止只在游戏内有界面。这一批把它搬到网站，**一律显示全部 30 天**。

游戏内能看多少天取决于这局怎么开的：从网站启动游戏是在线局，直连 API，拿得到完整 30 天；从游廊开的离线局发不出 HTTP 请求，只能走客户端代发通道——服务端把 JSON 塞进一个 HTML 页面的 `<title>` 里，`DOTAHTMLPanel` 的标题超过 4096 字符会被静默截断，那条通道只回最近 5 天。**这个上限是代发通道独有的，网站不受它约束。**

## 目标

1. `/profile/<steamId>/daily-task` 显示今天的任务状态与 30 天历史
2. 每条记录能看出是什么指标、几星、目标值、给了多少勇士积分
3. 任务定义表不在网站上维护第二份

## 接口

`GET /daily-task/{steamId}`，挂 `@AllowWeb()`——不挂网站带 `Authorization: Bearer` 的请求一律 401。

路由带 `:steamId`，guard 会校验它等于 Firebase uid，不一致返回 403，**网站不自己做归属校验**。现阶段只能自己看自己。

**整个页面只依赖这一条接口**，今天与历史一次拿全：

```ts
DailyTaskSnapshotDto = {
  steamId,
  dayId,             // 今天，UTC 天号
  candidates,        // 今天的 3 个候选任务
  completedTasks,    // 今天已完成的
  todaySeasonPoint,  // 今天拿到的勇士积分
  refreshRemaining,  // 剩余刷新次数
  history,           // 30 天历史
}

DailyTaskHistoryEntryDto = { dayId, tasks: TaskCandidateDto[], seasonPoint }
TaskCandidateDto = { taskId, scope, metric, heroName?, star, target, rewardSeasonPoint }
```

`candidates`、`completedTasks`、`history[].tasks` 里装的是同一种 `TaskCandidateDto`：

- `scope`：`personal_general` | `personal_hero`
- `metric`：kills / assists / last_hits / tower_kills / hero_damage / healing / total_gold_earned / damage_taken / stun_duration / roshan_kills
- `heroName` 只有 `personal_hero` 才有，是 `npc_dota_hero_*` 系统名
- `star` / `target` / `rewardSeasonPoint` 服务端已经展开好了

定义在 `api/src/daily-task/dto/daily-task-snapshot.dto.ts` 与 `api/src/daily-task/config/tasks.ts`。**网站不维护任务定义表**：星级与目标值随任务池调整，两边各存一份必然对不上。

**不要调 `/proxy/daily-task*`。** 那几条是游廊对局的客户端代发专用：只回 5 天，响应是一个 HTML 页面而不是 JSON。网站调它等于自愿接受上面那个 4096 的限制。

### 这条 GET 带副作用

它内部会做跨天归档：库里没有文档、或者玩家上次活动停在昨天，都会写一次 Firestore。**它不是纯读取**。

必须这样做，是因为归档是懒触发的。玩家昨天打完、今天还没开过游戏时，昨天的记录仍停在「今日」那一侧，没有进 history。纯读取会漏掉昨天——而「昨天打完、今天上网站看」恰好是最典型的使用场景。

由此带来一个后果，将来做统计时要记得：**网站来访就会给从没开过局的人建一个空文档**，所以「有每日任务文档」不等于「这人打过游戏」，不能拿它当活跃口径。

## 历史数据的五个约束

这几条决定了界面能长成什么样，都已在后端代码里核对过：

- **`dayId` 是 UTC 天号，格式 `YYYYMMDD`，不带横线。** 中国是 UTC+8，按浏览器本地时区渲染会跟游戏内差一天——每天早 8 点之前尤其明显。渲染、分组、比较全部按 UTC 处理
- **日期不连续。** 只有当天完成过任务才归档，一个任务都没完成的日子根本不进历史。所以列表中间会跳日期，**30 条也不等于 30 个自然日**，可能横跨两个月
- **`history` 里没有今天。** 今天的记录要到跨天时才归档，进行中的那天在 `completedTasks` 与 `todaySeasonPoint` 里。两边在同一个响应里，前端自己把今天拼到列表最前面，不用再发一次请求
- **一天最多 3 条，但可能不足 3 条甚至 0 条。** 每天 3 轮；另外任务池变更后查不到定义的条目服务端直接丢弃，所以条数可能比积分暗示的轮数少
- **文案与素材要自己一套。** 指标名与英雄名都要本地化，游戏内那套在 game 仓库、网站用不了；英雄头像的处理方式照搬[觉醒页](phase-3b-awaken-page.md)

## 界面

`/profile/<steamId>/daily-task`，客户端渲染，加载态用原位骨架块。

- **一次请求、一个加载态。** 今天与历史来自同一个响应，不要拆成两次请求或两块各自转圈
- **历史用列表，不做日历格子或热力图。** 日期本来就不连续（约束 2），日历会把「没打游戏」和「打了但没完成任务」画成同一个空格，热力图更是直接暗示日期连续。列表按日期倒序，跳过的日子就是不出现
- **今天单独占一块，排在历史之上，不混进同一个列表。** 今天还有候选任务与剩余刷新次数，历史条目没有这些字段；混在一起还得处理「今天的记录在跨天后会再出现一次」
- **一天的三条任务留三个位置，空位保留不压缩。** 条数不等于轮数（约束 4），按实际条数排版会让「完成 1 条」和「完成 3 条」的两天看起来一样满
- **历史的积分数字取每天的 `seasonPoint`，不拿三条任务的奖励相加。** 被丢弃的条目不在列表里但积分已经发过，加出来的数会比实际少
- **英雄任务显示头像，通用任务显示指标图标。** 两种任务在列表里要一眼分得开，`scope` 就是这个用途

菜单项先不放出来：`web/config/nav.ts` 里 `href` 填 `null`，头部据此跳过渲染；**页面上线时把 `href` 填上，同时必须有入口**（见 [docs/web/README.md](../../web/README.md) 第 3 节）。个人主页另加一张入口卡，与属性、觉醒并列。

## 不做

- **不做补完成、不做领取**：页面只读，任务完成与积分发放都在对局结算时由服务端完成
- **不做刷新按钮**：`refreshRemaining` 一并返回了，但刷新要消耗额度、且只对今天有意义。网站上刷新意味着玩家可能在开局前反复重掷，是个独立的产品决定，本批不碰
- **不给这条请求加浏览器缓存**：与全站「玩家数据不做浏览器缓存」一致，何况它带副作用
- **不做超过 30 天的翻页**：后端只留 30 条，翻不出更多

## 后续事项

- **指标与英雄名的中英文案**要新建一批 i18n key，数量约等于 10 个指标加全英雄表
- **接口的副作用值得在实现时挪进 `docs/api/`**：「网站来访会建空文档」是长期有效的数据约束，等阶段 3.5 落地、接口真实存在之后再写进去，本批先记在这里
