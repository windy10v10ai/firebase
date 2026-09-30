# API 架构

API 是一个 NestJS 应用，部署在第二代 Cloud Functions（Node.js 24，asia-northeast1），运行时由根目录的 `firebase.json` 指定。本文只写对外的形状：谁从哪个域名进来、API 自己往外调什么，以及计费与延迟上绕不开的约束。开发命令、测试与代码规约见 [api/CLAUDE.md](../../api/CLAUDE.md)。

## 对外入口

所有来源最终都进同一个 `client` 函数，但入口域名不同：

| 来源 | 入口域名 | 经过 |
|---|---|---|
| 网站浏览器 | `windy10v10ai.com` | Cloudflare → App Hosting（`web/next.config.ts` 的 `/api` 转发）→ 函数 |
| 游戏服务器 | `api.windy10v10ai.com` | Cloudflare → Firebase Hosting → 函数 |
| 支付宝 / 爱发电 / Ko-fi 回调 | `api.windy10v10ai.com` | Cloudflare → Firebase Hosting → 函数 |
| 启动器（直连失败时） | 腾讯云 SCF 广州（与游戏的 `cn-proxy` 同一个地址） | SCF → `api.windy10v10ai.com` → 函数 |

- 浏览器不直连 API 子域，是因为部分网络连不到它而主站域名通，取舍见 [docs/design/api-entry/README.md](../design/api-entry/README.md)
- 网站的转发直接打函数自己的地址，配在 `web/.env` 的 `API_ORIGIN`。不指 `api.windy10v10ai.com`，那样每个请求要多穿一次 Cloudflare 和 Firebase Hosting
- 支付宝的回调地址以下单请求带的 `notify_url` 为准，取自 `api/.env.windy10v10ai` 的 `ALIPAY_NOTIFY_URL`，开放平台后台配的只是兜底；爱发电与 Ko-fi 的配在各自平台的控制台，仓库里搜不到
- **只有直连 API 域名的请求带着玩家自己的来源信息。**经网站域名转发进来的，边缘看到的是转发服务器的地址，`cf-connecting-ip` 与 `cf-ipcountry` 不代表玩家。依赖真实来源的功能只能挂在直连的那条路上

## 对外依赖

API 自己往外调的第三方服务：

| 服务 | 用在 | 凭据 | 缓存 |
|---|---|---|---|
| Steam OpenID | 登录回调的二次核对 | 无 | 无 |
| Steam Web API `GetPlayerSummaries` | 玩家昵称与头像地址 | `STEAM_WEB_API_KEY` | Firestore `SteamProfiles`，正常 24 小时、取不到 1 小时 |
| Steam Web API `GetPlayerSummaries`（批量） | 排行榜前 500 名的昵称与头像 | 同上 | 存进当天的排行榜快照，每天只查一次（100 人一批，共 5 次） |
| Steam Web API `GetPublishedFileDetails` | 启动器检测工坊地图是否最新 | 无 | 每个函数实例内存 60 秒，响应带 `Cache-Control: max-age=60` |
| 爱发电订单查询 | 补激活遗漏的订单 | `AFDIAN_API_TOKEN` | 无 |
| GA4 Measurement Protocol | 服务端埋点 | `GA4_API_SECRET` | 无 |
| BigQuery 流式写入 | 战绩明细与积分流水，见「分析数据」 | 函数的运行时服务账号 | 无 |

两条只对 Steam Web API 成立、但必须守住的规矩：

- **key 只存在于服务端**：不下发给浏览器，也不做让浏览器间接打到 Steam 的转发。配额是 10 万次/天，靠上面那层缓存，实际调用量按「一天内被看过的不同玩家数」计
- **头像图片不经过 API**：接口只返回 `avatars.steamstatic.com` 上的地址，图片字节由浏览器直接取，我们既不付流量也不占函数调用

## 路由与认证

- Hosting 只按 `^/api/.*` 放行，顶层路径前缀的白名单在 `api/index.ts` 的 `client` 函数里。新增顶层前缀两处都要改，漏了会在进入 NestJS 之前被 403
- 服务端来源用 `x-api-key`，网站用 `Authorization: Bearer`，判定都在 `api/src/util/auth/auth.guard.ts`。公开端点挂 `@Public()`，网站要调的挂 `@AllowWeb()`
- **装饰器是加法，不是排他**：不挂任何装饰器的路由，官方服务器的 key 就能调；`@AllowWeb()` 额外放行网页，`@AllowLocal()` 额外放行打包进地图、随时可能泄露的本地主机 key。所以路由本身不代表来源，要区分来源取 `@CurrentServerType()`
- **归属校验只看路由参数 `:steamId`，不看请求体**。所以同一个动作给网站开放时，要新开一条把 steamId 放在路径上的路由，而不是给收 body 的那条补 `@AllowWeb()`——后者等于任何登录玩家都能操作别人的账号。每日任务的刷新就是这样分成两条：游戏内用 `POST /daily-task/refresh`（body 带 steamId，`@AllowLocal()`），网站用 `POST /daily-task/:steamId/refresh`（`@AllowWeb()`）
- **`GET /daily-task/:steamId` 有写库副作用**：跨天归档是取快照时懒触发的，纯读会漏掉「昨天打完、今天还没开过游戏」这一段。由此网站来访就会给从没开过局的人建一个空文档，**「有每日任务文档」不等于「这人打过游戏」**，别拿它当活跃口径
- **游戏端新增的请求体字段，后端一律按选填接收并给出兜底**：玩家不重启 Dota 就一直跑旧版地图，旧版会持续好几天。改成必填等于让旧版的请求整条 400，结算这类接口会直接丢分
- **请求体校验失败记一行 warn 日志**（`request validation failed`，带不合格的字段路径、`version` 与报文里的 steamId）：游戏端只知道请求失败、看不到原因，HTTP 日志里也没有请求体
- **`GET /api/launcher/workshop/:id` 是公开端点**：启动器是发给玩家的 exe，放进去的 key 等于公开。它只接受正式图与测试图两个工坊 ID，其余 404，免得被当成通用的 Steam 代理。启动器先直连 Steam，失败才来这里，所以海外玩家不经过我们的服务
- **`GET /api/launcher/version` 与 `GET /api/launcher/download/:version` 是启动器自我更新用的公开端点**：版本号与 exe 哈希写死在代码里，查版本不读任何文件；下载只接受当前版本，由函数从官网取 exe、核对哈希后返回。两者都靠 CDN 缓存挡住重复请求，下载地址带版本号可以永久缓存，所以哈希不符时宁可失败也不返回。放在 API 下而不是只放官网，是因为国内代理只转发 `/api/`
- 探活用公开端点 `GET /api/hello`。裸 `/api` 不匹配任何白名单，线上是 404
- 游戏客户端开局选路用 `GET /api/game/probe`，返回来源国家码。它只在玩家直连 API 域名时代表玩家本人，理由同上一节最后一条；设计见 [docs/design/api-entry/cn-gateway.md](../design/api-entry/cn-gateway.md)

### 本地主机来源的限额

打包进地图的本地 key 一解包就泄露，后端不能相信它带来的 steamId。挂了 `@AllowLocal()` 的路由里，凡是能产出或消耗资源的都按 steamId 限额，只对 `LOCAL` 来源生效，官方服务器不受影响。计数存在 `LocalRateLimit`（文档 id 就是 steamId），判定都在 `LocalHostService`。

| 限额 | 取值 | 超出时 |
|---|---|---|
| 结算冷却 | 5 分钟 | 整场拒绝，不加分也不记每日任务 |
| 每日结算获得的勇士积分 | 5000 | 同上，不做部分发放 |
| 单笔消耗会员积分 | 50 | 400 |
| 每日消耗会员积分 | 2000 | 200，但不扣分 |
| 每日创建支付宝订单 | 10 次，网站来源（`WEB`）也计入同一份 | 400；支付成功时清零当日计数 |

- **每日累计超限返回 200 而不是 400**：客户端不管成功失败都会刷新玩家数据，报错只换来一次无意义的重试。单笔超限是另一回事，正常玩法碰不到，只可能来自伪造或客户端 bug，所以照常报 400
- **三个当日计数共用一个 `dailyDate`**，日期对不上时必须一起归零，写回统一走 `LocalHostService` 里唯一那个写入口：只更新自己那一个再把日期推到今天，会把另外两个昨天的数字算成今天的
- **检查与记账是分开的两次读写，不上事务**：并发下同一个 steamId 最多多放一笔，代价以单笔上限封顶，为此上事务不划算
- **只按 steamId 限，不按 IP**：Cloud Functions 侧拿不到可信的客户端 IP。代价是泄露的 key 可以拿别人的 steamId 把对方当天的额度刷满，这是按 steamId 限额的固有代价
- **本地来源的积分消耗与限额拒绝各记一行日志**：只读接口与个人设置不记，记了也查不出冒用

### 代理路由 `/api/proxy/*`

游廊创建的多人对局里游戏服务端发不出 HTTP 请求，改由一名玩家客户端的网页控件代发。这类路由集中在 `proxy` 前缀下，形状与其他路由不同：只收 GET、认证读 query 的 `apiKey`、响应是把 JSON 塞进 `<title>` 的 HTML、任何异常都转成 200 加 `ERR:` 前缀（客户端读不到状态码）。

- **名字由原路由推出来**：`/proxy/` 加上原路径去掉路径参数后用连字符拍平。`GET /game/start` → `/proxy/game-start`，`GET /player/:steamId/info` → `/proxy/player-info`
- **不保留原来的斜杠分段**，因为路径参数一律挪进 query（网址由游戏服务端拼好，客户端只负责加载），留着斜杠会让人以为参数还在路径上
- **非 GET 的原路由加方法小写后缀，请求体 base64url 放进 query 的 `body`**：`POST /game/end/local` → `/proxy/game-end-local-post`。解码后走原路由同一套 DTO 校验
- **结算按玩家拆成自包含请求**：网址装不下整场数据，一局 N 个真人就是 N 条请求，每条 `players` 恰好一人，服务端无状态、不按 `matchId` 去重。限额与冷却照常逐人生效，是本地主机结算唯一的防线，所以不绕开 `LocalHostService.recordGameEnd`
- **代发结算只发按玩家的 GA4 事件**（`gameEndPlayerBot`），不发整场的 `gameEndMatch`：它一个事件装着全场数据，单玩家请求凑不齐，接受断供。单玩家请求凑不出全场人数，由客户端在报文里另带 `playerCount`，`player_count` 与行为分的组队判定（`isParty`）都读它，未传时按 1 算。这条路径没有机器人条目，是已知偏差。限额记录里的 `ipActivity` 记的是代发玩家的 IP，同一局所有玩家会是同一个值
- **原路由路径里的参数改走 query**：`PUT /player/:id/setting` → `/proxy/player-setting-put?steamId=…&body=…`
- **只接原路由已经 `@AllowLocal()` 的写入**：代理 controller 整体放行本地 key、直接调 service，绕得过原路由的认证。花积分的属性加点与重置、觉醒解锁与随机只认网页登录态，不进代理。原路由在 controller 里做的本地来源限制（如会员积分的每日限额）要先下沉到 service，两条路径调同一个方法
- **代理路由不是原路由的转发**：字段集与错误语义都可以不同，如 `/proxy/player-info` 查无此人返回空对象而不是 404。名字表达的是取哪条原路由的数据，改原路由不会自动改到它
- **title 上限 4096，随天数增长的字段不进开局包**：`/game/start` 与 `POST /daily-task/refresh` 的每日任务快照都不带 `history`（30 天可到 17000 字符），历史由 `GET /daily-task/:steamId` 单独取，它回带 30 天历史的完整快照，网站每日任务页也用它。代发版 `/proxy/daily-task` 只回最近 5 天历史、不含今日字段（开局时已下发），5 天实测标题 2723 字符，留约三成余量。取快照才会触发跨天归档，所以这条 GET 有写库副作用，不能改成纯读。超限时 `buildProxySuccessHtml` 记 warn 日志（`[Proxy] title too long`）

## 分析数据（BigQuery）

跨局统计、长期分析、积分核对都以 BigQuery 数据集 `game_data`（`asia-northeast1`）为准。GA4 只用来看用户趋势，`firestore_export` 是插件同步的文档快照，两者都不作为分析的原始数据。

| 表 | 一行是什么 | 分区 / 聚类 |
|---|---|---|
| `game_end_players` | 一次结算里的一个玩家，电脑也写（`steam_id` 为 0） | `ended_at` 按天 / `steam_id`、`difficulty`、`hero_name` |
| `point_ledger` | 一个积分字段的一次变动 | `created_at` 按天 / `steam_id` |

- **只在结算被接受后写入**：重复发送的请求由本地主机结算的冷却挡掉，表里不做去重。刷分局照样写入，查询时按 `game_options` 筛掉
- **`game_id` 由服务端给每次结算生成**：用启动器开局时 `match_id` 恒为 `"0"`，不能用来区分不同的局。结算加分的那条流水，`ref` 就是这个 `game_id`，支付类的流水 `ref` 是订单号
- **每行带一份原始报文（`raw`，JSON 列）**：游戏端新加的字段先落在这里，需要时再建列
- **写入是 best-effort**：失败只记 `[BigQuery] insert failed` 日志，结算和支付照常完成。所以流水只用来查，充值核对的兜底仍是 `firestore_export`
- **生产数据不设过期**。本地开发写同一项目里的 `game_data_dev`，分区保留 30 天；测试与 CI 不连 BigQuery。数据集由 `BIGQUERY_DATASET` 指定，未设置时不写
- **接口不直接查这里**：展示用的统计先预先算好、写回 Firestore，见下一节
- 表结构与建表脚本在仓库根目录的 `bigquery/`，改表先改那里的 SQL

## 成本与延迟

函数跑在 Cloud Run 上，计费方式是**「分配的 vCPU × 请求全时长」**，不看 CPU 实际利用率，等 I/O 的时间照样计费。这条决定了下面几件事。

- **逐玩家的操作一律并发**。Firestore 一次往返 30–80 ms，十个玩家串行就是 800 ms，其中 CPU 真正在干活的不到 10 ms，剩下全是花钱买来的等待。`Promise.all` 把它压到一次往返的时间，同一个接口的 CPU 计费降一个数量级
- **慢查询不能放进请求路径**。BigQuery 冷查询要 1–3 秒，同步调一次，这个请求的 CPU 计费就是普通 Firestore 请求的二十倍。分析类查询走 Cloud Scheduler 加 BigQuery Scheduled Query 预聚合，结果写回 Firestore，接口只读 Firestore
- **Firestore 没有服务端 GROUP BY**，聚合只能把文档全拉到内存里算，读次数随数据量线性涨。需要真聚合的场景同样走预聚合，不要留全表扫描的接口
- **不要调 `cpu` 与 `concurrency`**。`concurrency > 1` 要求 `cpu ≥ 1`；把 `cpu` 降到 1 以下会强制 `concurrency = 1`，I/O 密集场景下反而更贵。`api/index.ts` 用的是默认值（1 vCPU、并发 80），多个等 I/O 的请求共享同一个实例的计费，对这类负载就是最优解

## 一致性

系统对两类数据给的保证不一样，这是有意的。

**玩法数据**（战绩、积分、等级、任务进度）只做最终一致：读-改-写，不加事务、不加锁、不做失败补偿。一个玩家同一时刻只在一局游戏里，这些写入天然是顺序发生的，并发覆盖需要两条请求撞在同一个瞬间。真撞上了，代价是丢一次累加或一条记录，玩家继续玩就会被后面的数据盖过去。为这个概率引入事务，换来的是每次写入多一次读、多一条重试路径，以及测试里多一类几乎无法构造的场景。

**金钱**（支付回调、订单激活、退款、会员积分消耗）不走这套。第三方回调会重复投递、会乱序、会在超时后重发，这些不是低概率事件而是常态，必须按幂等来设计。

判断一条新逻辑落在哪边：**出错了玩家会不会损失已经付过的钱**。会 → 按金钱那套做；不会 → 按玩法数据那套做，选最简单能跑通的写法。
