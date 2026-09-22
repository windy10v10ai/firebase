# 近期战绩（playerStatsRecent）

> 对应 [#899](https://github.com/windy10v10ai/firebase/issues/899)。生涯累计战绩见 [#866](https://github.com/windy10v10ai/firebase/issues/866)，已上线。

玩家打完一局，结算界面上的数据只在那一屏存在，关掉就没了。生涯战绩只有累计值，看不出最近状态。本批给每个玩家留最近 50 场的单场明细，在个人主页展示。

## 边界

本批只做 Firestore 存储与网页展示：

- **存**：结算界面上玩家自己那一行的数据（力敏智除外，理由见「不做」），加上对局本身的胜负、时长、难度与倍率
- **显示**：个人主页新增一张「近期战绩」卡，一行五项
- **存了但本批不显示**：物品与技能。网站没有物品图标和普通技能图标，配齐是独立的一批活；数据先存下来，不存的话这段时间的对局就永久缺这两项

## 数据结构

顶级集合 `playerStatsRecent`，docId = steamId，单文档一个定长 50 的数组，新场次 prepend 后截断。

```
playerStatsRecent/{steamId}
  matches: [
    // 对局
    matchId, endedAt, version, durationSec, win, difficulty,
    multiplierRadiant, multiplierDire, towerPowerPct,
    // 玩家
    heroName, level, awaken, isDisconnected,
    kills, deaths, assists, lastHits, totalGoldEarned,
    heroDamage, damageTaken, healing, towerKills, stuns, roshanKills,
    battlePoints,
    // 游戏端发版后才有
    items,                                  // 定长 6，主物品栏，空槽为空串
    neutralItem, neutralPassiveItem,
    abilities,                              // [主动, 被动1, 被动2]
  ]
  updatedAt
```

一行约 1 KB，50 场满员约 50 KB，距 Firestore 单文档 1 MB 上限有二十倍余量。体积压力真的出现时，最先砍的是三个倍率字段——刷分局已经被过滤掉，剩下的对局这三个值接近恒定。

几个取值来源：

- `endedAt` 用服务端收到结算的时间。游戏端不发时间戳，为此加一个字段不值得
- `durationSec` 由报文的 `gameTimeMsec` 换算
- `win` 由玩家的 `teamId` 与报文根上的 `winnerTeamId` 比出来。本地主机那条路每条请求只带一个玩家，但 `winnerTeamId` 在根上，照样算得出
- `awaken` 沿用现有的 0/1 语义，觉醒的是英雄不是技能，战绩里只需要看出这个英雄是觉醒的

## 写入

挂在 `GameService.recordPlayerStats()`，与生涯战绩同一个调用点——在线与本地主机两条结算入口自动都覆盖到，不用分别改。

三条约束：

- **刷分局跳过**。直接复用 `shouldSkipStatsLifetimeForGameOptions`，与生涯战绩同一个口径。两份数据的入口不一致会让人无法解释为什么这局在战绩里有、在累计里没有
- **单字段超上限只丢那个字段**。复用 `validateStatContribution` 的每局上限，异常值落回 0 并记日志，整场仍然记录。否则一个坏数值会让整局在战绩里凭空消失
- **不按 matchId 去重**。控制台启动的对局引擎给的 matchId 恒为 `"0"`，拿它比对会把不同对局误判成重放。防重复由本地主机那条路已有的冷却窗口承担，与 [local-host.service.ts](../../../api/src/local-host/local-host.service.ts) 的现有做法一致

## 接口

`GET /player/:steamId/stats/recent`，挂 `@AllowWeb()`，可见性与生涯战绩一致，不加身份判断——同一张个人主页上两份战绩一份公开一份不公开，解释不通。

带 `limit` 参数，默认返回全部 50。Firestore 的读取粒度是整个文档，数组切片省不到读取侧；这个参数省的是 API 到浏览器那一跳，首屏请求 10 条就是 10 KB 而不是 50 KB。

不并进 `/player/:steamId/info`：那个接口是个人主页的首屏依赖，50 KB 挂上去会拖慢整页。

## 网页

个人主页「战绩」卡下方新增「近期战绩」卡，自己发一次请求、独立骨架屏。默认 10 行，点「查看全部」展开到 50。一行五项：英雄、胜负、时长、K/D/A、本局积分；点开一行看这场的完整数值。

## 游戏端依赖

物品与技能要 game 仓库另开一个 PR 上报：服务端读 `hero:GetItemInSlot(0..5, 16, 17)` 拿主物品栏、中立物品与中立被动，技能从 `lottery_status` 取三个名字。

本仓库不等它：DTO 把这四项声明成可选字段，游戏端没发版时它们就是空的，列表照常显示。那边发版后这边不用改代码，新场次自然带上。

## 不做

- **不存全场十人的记分板**。本地主机那条路每条请求只带一个玩家，凑不齐全场；而在线局目前只能单人，同场另外九个都是电脑
- **不存力敏智**。它是加点、装备与等级的结果，加点在网站上长期不变，同一个玩家每局这三个数几乎一样，不是单局表现的指标
- **不存技能品阶**。多存一个数字能看出手气，但当前展示用不上
- **不存行为分增减**。结算界面积分旁边那个 +13/-N 由游戏端算完就丢，没进报文。它只是 `battlePoints` 的一个来源拆解，当前行为分本身已经在个人主页上能看到，为拆解再改一轮游戏端不划算
- **不加历史清理**。50 场封顶，文档大小恒定

## 后续可能的扩展

**长期历史交给 BigQuery。** 数组是展示缓存不是事实来源，第 51 场之前的数据现在会被截断丢弃。今后可以在结算时把完整明细同时写一份进 BigQuery 永久留存，个人主页仍然读 Firestore 保持毫秒级，全服基线、按英雄胜率、六维图这类聚合在 BQ 里算完预聚合写回 Firestore。仓库已经在用 firestore-bigquery-export 导 players 与 members，这条路是通的。

分析查询不能放在请求路径上，理由见 [docs/api/README.md](../../api/README.md) 的「成本与延迟」。

**物品与技能的展示** 等图标方案定了再做，届时数据已经攒下来了。

## 未采用

- **Firestore 子集合（一场一文档）**。给得了分页与任意范围查询、历史不截断，但个人主页从 1 次读变成 10 到 50 次读。50 场封顶就不需要分页，长期历史由 BigQuery 接，剩下的好处付不起这个读取费。原本还有「matchId 当 docId 自带幂等」这条，被 matchId 恒为 0 打掉了
- **Cloud SQL**。能力最强，但月成本从约 ¥1,800 涨到 ¥4,200，且 ORM、Schema、迁移三步都还没做，是个跨多批次的基础设施项目，不该由这一个功能来付首付
- **BigQuery 直接作为主页数据源**。冷查询 1–3 秒，Cloud Run 按请求墙钟计费，单请求 CPU 计费会翻二十倍
