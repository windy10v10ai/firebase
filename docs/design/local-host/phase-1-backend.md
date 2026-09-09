# 本地主机策略 阶段 1a：后端

对应 issue [#1105](https://github.com/windy10v10ai/firebase/issues/1105)。策略总纲见 game 仓库 `docs/local-host/README.md`（windy10v10ai/game#2406），game 侧改动见 windy10v10ai/game#2407。

## 背景

Dota 2 官方自定义游戏服务器故障，玩家只能用本地主机开局。本地主机拿不到官方服务器密钥，临时用打包进地图的 API key 顶替；地图一解包 key 就泄露，后端不能相信本地来源的 steamId。

阶段 1 的做法是「放开低风险接口 + 对能产出或消耗资源的接口加限额」，改变账号养成状态的操作（加点、洗点、觉醒、点赞举报）继续拒绝，留给阶段 2 的网站承接。

后端先上，game 后上：旧地图在本地不会调这些接口，先上没有副作用。

## 目标

1. 本地 key 放行 7 条接口（键位、游戏预设、玩家信息、排行榜、会员积分消耗、支付宝下单与查单）
2. 本地 key 消耗会员积分限额：单笔 50、每日 1000
3. 本地 key 支付宝下单限流：每日 10 次，支付成功后清零
4. 开局接口对本地 key 也下发 GA4 配置
5. 本地 key 的关键写操作留审计日志

## 非目标

- IP 维度的限流：Cloud Functions 侧拿不到可信的客户端 IP，只做 steamId 维度
- 加点 / 洗点 / 觉醒 / 随机觉醒 / 点赞举报：继续对本地 key 拒绝
- 本地结算的每日勇士积分上限（当前 2000）与冷却（当前 10 分钟）：不调整
- 本地 key 轮换机制：阶段 4 处理
- 开局活动奖励：本地 key 可以领取，维持现状

## 1. 认证机制统一

### 现状

`AuthGuard` 逐个比对官方 / 测试 / ANIME 三把 key，命中放行，否则 401。本地 key 不在其中，所以需要本地 key 的路由只能挂 `@Public()` 完全关掉守卫，再在 controller 里手写 `SecretService.getServerTypeByApiKey` 补一道判断。`GET /game/start`、`POST /game/end/local`、`POST /daily-task/refresh` 三处都是这个写法。

问题是默认方向错了：`@Public()` 对所有人开放，连 key 都不用带，安全性全靠 handler 里那句手写判断兜底，漏写一句就是彻底裸奔。本次要新放行 7 条接口，手写会变成 10 处。

### 设计

守卫从「比对 key」改为「解析来源 + 按路由声明放行」：

1. 调用 `getServerTypeByApiKey` 解析出 `SERVER_TYPE`，写入 request，供 handler 读取
2. `UNKNOWN` 一律 401
3. `LOCAL` 只在路由挂了 `@AllowLocal()` 时放行，否则 401
4. 其余类型（`WINDY` / `TEST` / `ANIME`）放行，与现状一致

配套两个装饰器：

- `@AllowLocal()`：方法级，声明本路由额外接受本地 key
- `@CurrentServerType()`：参数装饰器，handler 需要区分来源时注入解析结果，不再自己读 header

`@Public()` 保留，只用于三个 webhook（支付宝 / 爱发电 / Ko-fi）——它们不带 key，靠签名或 token 验证。

守卫顺带从三次 `getSecretValue` 比对收敛成一次解析，以后新增服务器类型不用再改守卫。

### 为什么这样不会误开放

默认拒绝：本地 key 只在显式挂了 `@AllowLocal()` 的路由上通过。加点、洗点、觉醒、随机觉醒、点赞举报不挂，行为不变。漏挂装饰器的后果是「本地 key 被拒」，方向与现状相反。

e2e 里显式断言「本地 key 打这五条接口必须 401」，挂错装饰器会让测试变红。

### 放行名单

本次新挂 `@AllowLocal()`：

| 路由 | 说明 |
|---|---|
| `PUT /player/:id/setting` | 键位保存 |
| `PUT /player/:id/game-preset` | 游戏预设保存 |
| `GET /player/:steamId/info` | 玩家信息刷新 |
| `GET /player/ranking` | 排行榜 |
| `POST /player/member-points/use` | 会员积分消耗（见第 2 节） |
| `POST /alipay/order/create` | 支付宝下单（见第 3 节） |
| `GET /alipay/order/query` | 支付宝查单 |

同时改造现有三处：`GET /game/start`、`POST /game/end/local`、`POST /daily-task/refresh` 从 `@Public()` + 手写判断改为 `@AllowLocal()`，删掉手写代码。`POST /game/end/local` 保留它自己「非本地 key 不结算」那一句。

### 行为变更

`GET /game/start` 遇到未知 key，现状返回 200 + 空数据，改造后由守卫返回 401。与 `POST /daily-task/refresh` 现有行为一致。

## 2. 会员积分限额

只对本地 key 生效：单笔上限 50，每日累计上限 1000（UTC 日切），超出返回 400。官方来源不受影响。

限额逻辑放 `LocalHostService`，沿用它现有的两段式写法（只读检查 + 成功后落盘）：

1. 检查当日累计与单笔上限（只读）
2. 调用现有的会员积分扣除逻辑
3. 扣除成功后再累加当日计数

扣除失败（余额不足）不占额度。检查与落盘之间不是原子的，并发下最多多扣一笔，可接受。

## 3. 支付宝下单限流

只对本地 key 生效：每个 steamId 每日最多 10 次下单，超出返回 400；支付成功时清零当日计数。

10 次 / 天与客户端现有的「一局最多 10 次下单、支付成功后重置」对齐。清零动作放在支付宝 webhook 的成功分支，对所有来源无条件执行——webhook 由支付宝回调，本身不带来源信息，且清零对官方来源无副作用。

查单接口不限流：它是前端 2 秒一次的轮询，客户端已经做了并发抑制。

未支付订单数不单独统计。每日 10 次的计数只增不减，堆积的未支付订单必然已经计入，效果等价且不需要额外的 Firestore 复合索引。

模块依赖：`AlipayModule` 与 `PlayerInfoModule` 引入 `LocalHostModule`。`LocalHostModule` 只依赖 `PlayerModule` 和 `DailyTaskModule`，不构成循环。

## 4. GA4 配置

`GameService.getGA4Config` 当前排除本地与未知两种来源，改为只排除未知，本地 key 也下发配置。

接受这期间混入假数据——不开就完全没有统计数据。

## 5. 审计日志

只写两处，每处一行：

- 本地 key 消耗会员积分成功：steamId、消耗数量、用途
- 本地限额拒绝（会员积分超限 / 下单超限）：steamId、原因

键位、游戏预设、玩家信息、排行榜、查单不记日志——只读或纯个人设置，记了也查不出冒用。下单成功已有日志，不重复添加。

## 数据模型

复用 `LocalRateLimit`（文档 id 为 steamId），新增四个可选字段：

| 字段 | 用途 |
|---|---|
| `memberPointDate` | 会员积分计数所属日期（UTC 零点） |
| `memberPointTotal` | 当日已消耗会员积分 |
| `orderDate` | 下单计数所属日期（UTC 零点） |
| `orderCount` | 当日已下单次数 |

日期不匹配即视为 0，与现有 `dailyPointsDate` / `dailyPointsTotal` 的处理方式一致。不新建集合，不做迁移——老文档缺字段等同于 0。

## 测试

单元测试（`LocalHostService`）：

- 会员积分：单笔超限、当日累计超限、跨日重置、边界值恰好等于上限
- 下单：当日次数超限、跨日重置、支付成功清零

E2E：

- 新增放行名单测试：本地 key 打 7 条放行接口不返回 401；打加点 / 洗点 / 觉醒 / 随机觉醒 / 点赞举报五条必须 401
- 会员积分限额：本地 key 单笔 51 拒绝、累计到 1000 后拒绝、官方 key 不受限
- 支付宝下单限流：本地 key 第 11 次拒绝、支付成功后可继续下单（支付宝 e2e 已 mock 外部接口）

各用例使用独立 steamId。

## 上线

后端可以一次上完，也可以按接口拆成多次部署——旧地图在本地不会调这些接口，先上没有副作用。game 侧（windy10v10ai/game#2407）在后端上线之后再发。

## 后续阶段

阶段 2 的网站（Steam 登录 + 属性 / 觉醒 / 会员页面）会拆成多个小步骤，设计文档放 `docs/design/web/`。
