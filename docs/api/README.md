# API 架构

API 是一个 NestJS 应用，部署成单个 Cloud Functions 函数 `client`（asia-northeast1）。本文只写对外的形状：谁从哪个域名进来、API 自己往外调什么，以及计费与延迟上绕不开的约束。开发命令、测试与代码规约见 [api/CLAUDE.md](../../api/CLAUDE.md)。

## 对外入口

所有来源最终都进同一个 `client` 函数，但入口域名不同：

| 来源 | 入口域名 | 经过 |
|---|---|---|
| 网站浏览器 | `windy10v10ai.com` | Cloudflare → App Hosting（`web/next.config.ts` 的 `/api` 转发）→ 函数 |
| 支付宝回调 | `windy10v10ai.com` | 同上 |
| 游戏服务器 | `api.windy10v10ai.com` | Cloudflare → Firebase Hosting → 函数 |
| 爱发电 / Ko-fi 回调 | `windy10v10ai.web.app` | Firebase Hosting → 函数 |

- 浏览器不直连 API 子域，是因为部分网络连不到它而主站域名通，取舍见 [docs/design/api-entry/README.md](../design/api-entry/README.md)
- 网站的转发直接打函数自己的地址，配在 `web/.env` 的 `API_ORIGIN`。不指 `api.windy10v10ai.com`，那样每个请求要多穿一次 Cloudflare 和 Firebase Hosting
- **改 `API_ORIGIN` 会同时改掉支付宝回调的路径**，要连收款一起验。支付宝的回调地址由 `api/.env.windy10v10ai` 的 `ALIPAY_NOTIFY_URL` 决定；爱发电与 Ko-fi 的配在各自平台的控制台，仓库里搜不到
- **只有直连 API 域名的请求带着玩家自己的来源信息。**经网站域名转发进来的，边缘看到的是转发服务器的地址，`cf-connecting-ip` 与 `cf-ipcountry` 不代表玩家。依赖真实来源的功能只能挂在直连的那条路上

## 对外依赖

API 自己往外调的第三方服务：

| 服务 | 用在 | 凭据 | 缓存 |
|---|---|---|---|
| Steam OpenID | 登录回调的二次核对 | 无 | 无 |
| Steam Web API `GetPlayerSummaries` | 玩家昵称与头像地址 | `STEAM_WEB_API_KEY` | Firestore `SteamProfiles`，正常 24 小时、取不到 1 小时 |
| 爱发电订单查询 | 补激活遗漏的订单 | `AFDIAN_API_TOKEN` | 无 |
| GA4 Measurement Protocol | 服务端埋点 | `GA4_API_SECRET` | 无 |

两条只对 Steam Web API 成立、但必须守住的规矩：

- **key 只存在于服务端**：不下发给浏览器，也不做让浏览器间接打到 Steam 的转发。配额是 10 万次/天，靠上面那层缓存，实际调用量按「一天内被看过的不同玩家数」计
- **头像图片不经过 API**：接口只返回 `avatars.steamstatic.com` 上的地址，图片字节由浏览器直接取，我们既不付流量也不占函数调用

## 路由与认证

- Hosting 只按 `^/api/.*` 放行，顶层路径前缀的白名单在 `api/index.ts` 的 `client` 函数里。新增顶层前缀两处都要改，漏了会在进入 NestJS 之前被 403
- 服务端来源用 `x-api-key`，网站用 `Authorization: Bearer`，判定都在 `api/src/util/auth/auth.guard.ts`。公开端点挂 `@Public()`，网站要调的挂 `@AllowWeb()`
- **装饰器是加法，不是排他**：不挂任何装饰器的路由，官方服务器的 key 就能调；`@AllowWeb()` 额外放行网页，`@AllowLocal()` 额外放行打包进地图、随时可能泄露的本地主机 key。所以路由本身不代表来源，要区分来源取 `@CurrentServerType()`
- 探活用公开端点 `GET /api/hello`。裸 `/api` 不匹配任何白名单，线上是 404
- 游戏客户端开局选路用 `GET /api/game/probe`，返回来源国家码。它只在玩家直连 API 域名时代表玩家本人，理由同上一节最后一条；设计见 [docs/design/api-entry/cn-gateway.md](../design/api-entry/cn-gateway.md)

### 代理路由 `/api/proxy/*`

游廊创建的多人对局里游戏服务端发不出 HTTP 请求，改由一名玩家客户端的网页控件代发。这类路由集中在 `proxy` 前缀下，形状与其他路由不同：只收 GET、认证读 query 的 `apiKey`、响应是把 JSON 塞进 `<title>` 的 HTML、任何异常都转成 200 加 `ERR:` 前缀（客户端读不到状态码）。

- **名字由原路由推出来**：`/proxy/` 加上原路径去掉路径参数后用连字符拍平。`GET /game/start` → `/proxy/game-start`，`GET /player/:steamId/info` → `/proxy/player-info`
- **不保留原来的斜杠分段**，因为路径参数一律挪进 query（网址由游戏服务端拼好，客户端只负责加载），留着斜杠会让人以为参数还在路径上
- **非 GET 的原路由加方法小写后缀，请求体 base64url 放进 query 的 `body`**：`POST /game/end/local` → `/proxy/game-end-local-post`。解码后走原路由同一套 DTO 校验
- **结算按玩家拆成自包含请求**：网址装不下整场数据，一局 N 个真人就是 N 条请求，每条 `players` 恰好一人，服务端无状态、不按 `matchId` 去重。限额与冷却照常逐人生效，是本地主机结算唯一的防线，所以不绕开 `LocalHostService.recordGameEnd`
- **代发结算只发按玩家的 GA4 事件**（`gameEndPlayerBot`），不发整场的 `gameEndMatch`：它一个事件装着全场数据，单玩家请求凑不齐，接受断供。单玩家请求凑不出全场人数，由客户端在报文里另带 `playerCount`，`player_count` 与行为分的组队判定（`isParty`）都优先读它，未传时按报文里的真人数算。这条路径没有机器人条目，是已知偏差。限额记录里的 `ipActivity` 记的是代发玩家的 IP，同一局所有玩家会是同一个值
- **代理路由不是原路由的转发**：字段集与错误语义都可以不同，如 `/proxy/player-info` 查无此人返回空对象而不是 404。名字表达的是取哪条原路由的数据，改原路由不会自动改到它

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
