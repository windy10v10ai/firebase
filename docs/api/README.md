# API 架构

API 是一个 NestJS 应用，部署在第二代 Cloud Functions，运行时由根目录的 `firebase.json` 指定。本文只写对外的形状：谁从哪个域名进来、API 自己往外调什么，以及计费与延迟上绕不开的约束。开发命令、测试与代码规约见 [api/CLAUDE.md](../../api/CLAUDE.md)，取值一律以代码为准。

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
- **转发服务器放宽了响应头上限**（`web/apphosting.yaml` 的 `NODE_OPTIONS`）：上游响应偶尔带着超过 Node 默认上限的头，超限时转发直接回 500。换掉转发实现时同样要放宽
- 支付宝的回调地址以下单请求带的 `notify_url` 为准，取自 `api/.env.windy10v10ai` 的 `ALIPAY_NOTIFY_URL`，开放平台后台配的只是兜底；爱发电与 Ko-fi 的配在各自平台的控制台，仓库里搜不到
- **只有直连 API 域名的请求带着玩家自己的来源信息。**经网站域名转发进来的，边缘看到的是转发服务器的地址，`cf-connecting-ip` 与 `cf-ipcountry` 不代表玩家。依赖真实来源的功能只能挂在直连的那条路上

## 对外依赖

API 自己往外调的第三方服务：

| 服务 | 用在 | 凭据 | 缓存 |
|---|---|---|---|
| Steam OpenID | 登录回调的二次核对 | 无 | 无 |
| Steam Web API `GetPlayerSummaries` | 玩家昵称与头像地址 | `STEAM_WEB_API_KEY` | Firestore `SteamProfiles` |
| Steam Web API `GetPlayerSummaries`（批量） | 排行榜的昵称与头像 | 同上 | 存进当天的排行榜快照，每天只查一次 |
| Steam Web API `GetPublishedFileDetails` | 启动器检测工坊地图是否最新 | 无 | 函数实例内存与 CDN |
| 爱发电订单查询 | 补激活遗漏的订单 | `AFDIAN_API_TOKEN` | 无 |
| GA4 Measurement Protocol | 服务端埋点 | `GA4_API_SECRET` | 无 |
| 启动器中转服务器（不调用，只签通行证） | 给联机加入签中转通行证 | `LAUNCHER_RELAY_PRIVATE_KEY` | 无 |
| BigQuery 流式写入 | 战绩明细与积分记录，见「分析数据」 | 函数的运行时服务账号 | 无 |

Steam 这边必须守住的规矩：

- **key 只存在于服务端**：不下发给浏览器，也不做让浏览器间接打到 Steam 的转发。Steam 有每日调用配额，靠上面那层缓存，实际调用量按「一天内被看过的不同玩家数」计
- **登录签发 Custom Token 要 `signBlob` 权限**：`createCustomToken` 用运行时服务账号签名，默认没有这个权限，要给 `<项目编号>-compute@developer.gserviceaccount.com` 授予它自身的 Service Account Token Creator 角色，否则线上登录报 `Permission 'iam.serviceAccounts.signBlob' denied`
- **头像图片不经过 API**：接口只返回 `avatars.steamstatic.com` 上的地址，图片字节由浏览器直接取，我们既不付流量也不占函数调用

## 路由与认证

- Hosting 只按 `^/api/.*` 放行，其余路由由 NestJS 自己决定，不存在的路径返回 404。探活用公开端点 `GET /api/hello`，裸 `/api` 不匹配转发规则
- **管理接口与公开接口分成两个应用**：公开的 `client` 函数只装 `ClientAppModule`，路由表里没有 `/api/admin`；`admin` 函数装全部模块，靠 `invoker: private` 只放行有 GCP 身份的调用。这样新增模块不用再登记任何名单，装错模块的后果是接口 404 而不是管理接口暴露，有单测守着这条
- 服务端来源用 `x-api-key`，网站用 `Authorization: Bearer`，判定都在 `api/src/util/auth/auth.guard.ts`。公开端点挂 `@Public()`，网站要调的挂 `@AllowWeb()`
- **装饰器是加法，不是排他**：不挂任何装饰器的路由，官方服务器的 key 就能调；`@AllowWeb()` 额外放行网页，`@AllowLocal()` 额外放行打包进地图、随时可能泄露的本地主机 key。所以路由本身不代表来源，要区分来源取 `@CurrentServerType()`
- **归属校验只看路由参数 `:steamId`，不看请求体**。同一个动作给网站开放时，要新开一条把 steamId 放在路径上的路由，而不是给收 body 的那条补 `@AllowWeb()`——后者等于任何登录玩家都能操作别人的账号。每日任务的刷新就是这样分成游戏内的 `POST /daily-task/refresh` 与网站的 `POST /daily-task/:steamId/refresh`
- **看别人的主页走 `@AllowViewOthers()`**：挂了它的只读路由，未登录或别人的 token 也能读 `:steamId` 的数据；写接口一律不挂。玩家关闭公开（`Player.profileHidden`）时访客一律 403，这个判断放在 guard 里，新加的只读路由挂上装饰器就受约束，代价是访客每次请求多读一次玩家文档。只给本人的字段由 `@CanViewPrivate()` 判断后在 service 里裁掉。每日任务不对访客开放：它的读取会替玩家生成当天任务
- **`GET /daily-task/:steamId` 有写库副作用**：跨天归档是取快照时懒触发的，纯读会漏掉「昨天打完、今天还没开过游戏」这一段。由此网站来访会给从没开过局的人建一个空文档，**「有每日任务文档」不等于「这人打过游戏」**，别拿它当活跃口径
- **游戏端新增的请求体字段，后端一律按选填接收并给出兜底**：玩家不重启 Dota 就一直跑旧版地图。改成必填等于让旧版的请求整条 400，结算这类接口会直接丢分
- **请求体校验失败记一行 warn 日志**（`request validation failed`，带不合格的字段路径、`version` 与报文里的 steamId）：游戏端只知道请求失败、看不到原因，HTTP 日志里也没有请求体
- **`GET /api/launcher/workshop/:id` 是公开端点**：启动器是发给玩家的 exe，放进去的 key 等于公开。它只接受正式图与测试图两个工坊 ID，其余 404，免得被当成通用的 Steam 代理。启动器先直连 Steam，失败才来这里
- **`GET /api/launcher/version` 与 `GET /api/launcher/download/:version` 是启动器自我更新用的公开端点**：版本号与 exe 哈希写死在代码里；下载只接受当前版本，由函数从官网取 exe、核对哈希后返回。两者都靠 CDN 缓存挡住重复请求，下载地址带版本号可以永久缓存，所以哈希不符时宁可失败也不返回。放在 API 下而不是只放官网，是因为国内代理只转发 `/api/`
- **`POST /api/launcher/rooms/host` 与 `POST /api/launcher/rooms/:code/join` 是启动器联机开房用的公开端点**：只负责交换双方地址，游戏数据不经过这里。exe 里放不了秘密，权限靠开房、加入时发下去的随机令牌：只有房主能取到加入请求。配了中转时，加入与房主轮询的响应附带用私钥签的中转通行证与这次加入要依次尝试的中转，中转只用公钥验签、不回调 API；加入的响应还带加入后实测选线的得分参数，加入者的测量结果由房主随轮询转报。房间与加入请求存 Firestore，带 IP，按 TTL 字段 `expireAt` 清理，删除规则写在 `firestore.indexes.json`，随部署生效。设计见 [docs/design/launcher-multiplayer/phase-1-friend-room.md](../design/launcher-multiplayer/phase-1-friend-room.md)
- **`POST /api/launcher/rooms/list` 是启动器列公开房间的公开端点**：只返回房间码、房里玩家的昵称头像、地图与人数，不含地址与令牌。列出心跳未过期的可加入房间，以及已开局未结束的游戏；好友房只给人数与已进行时间。玩家资料由 API 获取，不用房主上报的资料。等待房间与游戏分别缓存，游戏状态允许更长的展示延迟，以减少重复读取；跨局重叠时优先展示等待状态，避免列表与人数重复统计。握手仅处理有效窗口内的加入与测速请求，历史记录不参与轮询。新增查询索引须在 API 上线前就绪。设计见 [docs/design/launcher-multiplayer/phase-2-public-room.md](../design/launcher-multiplayer/phase-2-public-room.md)
- **`POST /api/feedback` 是玩家反馈的公开端点**，启动器、游戏与网站共用，`source` 区分来源；网站已登录时改走 `POST /api/feedback/web`（`@AllowWeb()`），Steam ID 取登录态，报告的 `steamIdVerified` 只有这条路是 true，其余来源请求体里的 ID 都能伪造。游戏来源不带日志，改带游戏现场 `gameState`，字段名与结算一致。报告存 Firestore `FeedbackReports`，日志压缩后存 GCS 桶 `windy10v10ai-feedback`（标成 gzip 编码，下载即解压），两边都定期删除，桶的删除规则是桶上的生命周期设置，不随部署。exe 里放不了秘密，滥用靠次数上限挡：个人按 Steam ID 限频，没有 ID 时按 IP（国内代理转发的请求共用代理 IP）；另有全站每日上限，Steam ID 能伪造，这是存储费用的封顶。分类与仓库标签的对应见 [feedback-review](../../.claude/skills/feedback-review/SKILL.md) 技能，取舍见 [docs/design/launcher-feedback/phase-1-launcher.md](../design/launcher-feedback/phase-1-launcher.md)
- 游戏客户端开局选路用 `GET /api/game/probe`，返回来源国家码。它只在玩家直连 API 域名时代表玩家本人，理由见「对外入口」；设计见 [docs/design/api-entry/cn-gateway.md](../design/api-entry/cn-gateway.md)

### 本地主机来源的限额

打包进地图的本地 key 一解包就泄露，后端不能相信它带来的 steamId。挂了 `@AllowLocal()` 的路由里，凡是能产出或消耗资源的都按 steamId 限额，只对 `LOCAL` 来源生效，官方服务器不受影响。计数存在 `LocalRateLimit`（文档 id 就是 steamId），判定与取值都在 `LocalHostService`。

| 限额 | 超出时 |
|---|---|
| 结算冷却 | 整场拒绝，不加分也不记每日任务 |
| 每日结算获得的勇士积分 | 同上，不做部分发放 |
| 单笔消耗会员积分 | 400 |
| 每日消耗会员积分 | 200，但不扣分 |
| 每日创建支付宝订单，网站来源（`WEB`）也计入同一份 | 400；支付成功时清零当日计数 |

- **每日累计超限返回 200 而不是 400**：客户端不管成功失败都会刷新玩家数据，报错只换来一次无意义的重试。单笔超限正常玩法碰不到，只可能来自伪造或客户端 bug，所以照常报 400
- **三个当日计数共用一个 `dailyDate`**，日期对不上时必须一起归零，写回统一走 `LocalHostService` 里唯一那个写入口：只更新自己那一个再把日期推到今天，会把另外两个昨天的数字算成今天的
- **检查与记账是分开的两次读写，不上事务**：并发下同一个 steamId 最多多放一笔，代价以单笔上限封顶
- **只按 steamId 限，不按 IP**：Cloud Functions 侧拿不到可信的客户端 IP。代价是泄露的 key 可以拿别人的 steamId 把对方当天的额度刷满
- **本地来源的积分消耗与限额拒绝各记一行日志**：只读接口与个人设置不记，记了也查不出冒用

### 代理路由 `/api/proxy/*`

游廊创建的多人对局里游戏服务端发不出 HTTP 请求，改由一名玩家客户端的网页控件代发。这类路由集中在 `proxy` 前缀下，形状与其他路由不同：只收 GET、认证读 query 的 `apiKey`、响应是把 JSON 塞进 `<title>` 的 HTML、任何异常都转成 200 加 `ERR:` 前缀（客户端读不到状态码）。

- **名字由原路由推出来**：`/proxy/` 加上原路径去掉路径参数后用连字符拍平，路径参数改走 query。`GET /player/:steamId/info` → `/proxy/player-info`。不保留斜杠分段，免得让人以为参数还在路径上
- **非 GET 的原路由加方法小写后缀，请求体 base64url 放进 query 的 `body`**：`POST /game/end/local` → `/proxy/game-end-local-post`。解码后走原路由同一套 DTO 校验
- **结算按玩家拆成自包含请求**：网址装不下整场数据，一局 N 个真人就是 N 条请求，每条 `players` 恰好一人，服务端无状态、不按 `matchId` 去重。限额与冷却照常逐人生效，是本地主机结算唯一的防线，所以不绕开 `LocalHostService.recordGameEnd`
- **代发结算只发按玩家的 GA4 事件**（`gameEndPlayerBot`），不发整场的 `gameEndMatch`：单玩家请求凑不齐全场数据。全场人数由客户端在报文里另带 `playerCount`，`player_count` 与行为分的组队判定都读它。这条路径没有机器人条目，是已知偏差；限额记录里的 `ipActivity` 记的是代发玩家的 IP，同一局所有玩家相同
- **只接原路由已经 `@AllowLocal()` 的写入**：代理 controller 整体放行本地 key、直接调 service，绕得过原路由的认证。花积分的属性加点与重置、觉醒解锁与随机只认网页登录态，不进代理。原路由在 controller 里做的本地来源限制要先下沉到 service，两条路径调同一个方法
- **代理路由不是原路由的转发**：字段集与错误语义都可以不同，如 `/proxy/player-info` 查无此人返回空对象而不是 404。改原路由不会自动改到它
- **429 限频按 message 映射成专用错误码**：反馈的个人限频与全站日上限在代发路由上变成 `ERR:too_many_reports`、`ERR:daily_limit_reached`，游戏据此给玩家不同提示；其他 429 仍归 `internal`
- **title 有长度上限，随天数增长的字段不进开局包**：开局与刷新返回的每日任务快照不带历史，历史由 `GET /daily-task/:steamId` 单独取；代发版 `/proxy/daily-task` 只回最近几天的历史、不含开局已下发的今日字段。超限时记 warn 日志（`[Proxy] title too long`）

## 启动器联机

`/api/launcher/rooms` 端点见上面「路由与认证」，启动器侧的结构见 [launcher/README.md](../../launcher/README.md) 的「联机」。这里记跨仓库的约定和代码里读不出的规则。

- **房间码就是凭证**：知道码就能发起加入，专用服仍校验每个人的 Steam 账号。不做限流：码空间大、同时开着的房间少，函数又拿不到可信 IP，Steam ID 是自报的
- **房间靠房主轮询续命**：轮询同时是心跳，超时视为关闭，房主崩溃、开新房都靠它让旧房间失效，不另设关房请求；过期由 API 自己判断，不等 Firestore TTL。轮询没有状态变化时隔一段才写一次心跳，人数、名单、开始结束等状态变化立刻写
- **房主与加入者互相能看到对方 IP**：打洞要求互知地址，所有点对点联机都这样
- **中转通行证是 API 与中转服务器（server 仓库）之间的约定**：`base64url(载荷).base64url(签名)`，载荷 JSON `{"j":"<joinId>","r":"h"|"j","e":<过期 Unix 秒>}`，Ed25519 签名。同一 `joinId` 的房主与加入者配成一对，同一身份重复认领以最新地址为准，用于掉线重连；通行证不绑中转地址。私钥在 Secret Manager，中转的配置里只放公钥 `MCowBQYDK2VwAyEA5jg6ifgT3iL6fUxsjeymZy9x4Ni1BnPTrMocZfhxrpc=`
- **通行证不是防滥用的边界**：任何人都能自己开房、自己加入拿到一对，费用靠中转自身的限速、端口数上限与云服务器的带宽上限封顶
- **中转列表与选线参数都在 API**：增减中转、调优先级、改参数只部署 API，不用发启动器。没配私钥就不发通行证，响应里没有选线参数就不实测选线，这两处也是关掉对应功能的开关
- **优先级按计费方式分档**：包月不限流量的中转同一档，只比房主与加入者合计的延迟丢包得分；有流量上限或按量计费的低一档，得分好出一截才被提前，免得为一点差距多花流量

## 分析数据（BigQuery）

跨局统计、长期分析、积分核对都以 BigQuery 数据集 `game_data`（`asia-northeast1`）为准。GA4 只用来看用户趋势，不作为分析的原始数据。数据集 `firestore_export` 是已卸载插件留下的旧文档快照，不再更新。

| 表 | 一行是什么 | 分区 / 聚类 |
|---|---|---|
| `game_end_players` | 一次结算里的一个玩家，电脑也写（`steam_id` 为 0） | `ended_at` 按天 / `steam_id`、`difficulty`、`hero_name` |
| `point_history` | 一种积分的一次变动：获得记在 `added`，花掉记在 `used` | `created_at` 按天 / `steam_id` |
| `member_history` | 一次开通或续费会员，写入前后的等级与到期日都留下 | `created_at` 按天 / `steam_id` |
| `launcher_room_events` | 启动器联机的一次开房或一次加入的连接结果，用来看打洞失败率 | `event_time` 按天 / `event` |
| `game_perf` | 一局的卡顿比值与单位规模 | `ended_at` 按天 / `host`、`route` |

- **只在结算被接受后写入**：重复发送的请求由本地主机结算的冷却挡掉，表里不做去重。刷分局照样写入，查询时按 `game_options` 筛掉
- **`game_id` 由服务端给每次结算生成**：用启动器开局时 `match_id` 恒为 `"0"`，不能用来区分不同的局。结算加分的那条积分记录，`ref` 就是这个 `game_id`，支付类的积分记录 `ref` 是订单号
- **卡顿一局一行**：只随第一条结算发，那条被拒收时这局没有卡顿数据；整局一份，所以不和每人一行的战绩同表
- **每行带一份原始报文（`raw`，JSON 列）**：游戏端新加的字段先落在这里，需要时再建列
- **写入是 best-effort**：失败只记 `[BigQuery] insert failed` 日志，结算和支付照常完成。充值与会员核对以积分、会员记录为准，玩家文档被并发写覆盖丢掉的积分在这里看不出来
- **生产数据不设过期**。本地开发写同一项目里的 `game_data_dev`，分区会过期；测试与 CI 不连 BigQuery。数据集由 `BIGQUERY_DATASET` 指定，未设置时不写
- **接口不直接查这里**：展示用的统计先预先算好、写回 Firestore，见「预先汇总」
- **看板视图只放明细**：分位数由 Looker Studio 按筛选现算，预先算好的分位数无法跨天、跨版本合并
- 表结构、视图与建表脚本在仓库根目录的 `bigquery/`，改表先改那里的 SQL

### `launcher_room_events` 的字段

一行一个事件，用开房时生成的 `room_id` 关联房主与加入者，不用房间码：码过期后会复用。看字段名猜不出的几处：

- **`event`**：`room_created` 开房；`join_succeeded` / `join_failed` 加入结果；`connection_quality` 游戏中每名加入者定期一行线路质量；`route_checked` 加入后实测选线一行。后三种都由房主随轮询上报，房主崩溃时会丢
- **`path`**：连通所走的路 `lan` / `punch` / `relay`。`connection_quality` 里是这段时间实际在用的路，`route_checked` 里是测完后选定的路
- **`*_upnp` 已停用、恒为 false**；`host_public_ip` 表示房主网卡地址就是公网地址；`*_symmetric_nat` 为真时打洞基本必败，只拿到一个 STUN 结果时为空
- **`steam_id` 是上报者**，开房是房主、加入是加入者，启动器从注册表读、可伪造，只用于排查；`host_steam_id` 由 API 从房间文档取
- **丢包率按 `SUM(ping_lost) / SUM(ping_sent)` 汇总**，不要平均百分比。测的是两个启动器之间一来一回，游廊开局没有这一段
- **不记 IP**：按地区分析时查 Firestore 加入记录里的候选地址，它们按 TTL 清理

### 预先汇总

- **每天跑一次的任务都挂在 `api/index.ts` 的 `dailyJobs` 定时函数里**：按频率分函数，不按任务分，新任务往列表里加一项，各自捕获错误、互不影响。不并进补单函数，分析查询慢了不能拖累支付
- **结果写进 Firestore 的 `DailyStats` 集合，一种统计一个文档**，文档 id 是统计名，每天整份覆盖。各统计的数据结构不同，在代码里按文档 id 分别定义，新统计不新建集合
- **全体基准**：近期的真人玩家、排除掉线与刷分局（口径同生涯战绩），按难度求各项的分位点。每局按「1 ÷ 该玩家在这个难度的局数」加权，每人合计一票：重度玩家水平偏高，按局算会把基准抬高；在这个难度局数太少的玩家不计入，偶然性大。不设人数门槛，门槛只会让图消失。基准空了或某个难度分位点不全时，个人页对应的局不参与计算
- **个人六边形**：玩家最近若干场的每一局，逐项在同难度的分位点间插值，得出在全体中的百分位，再对各局取平均。有效局数不够时不返回。不用平均值比：伤害、金钱这类数据偏斜，平均值被少数高手拉高，各项的分散程度也不同，比值画出来的形状反映的是哪项波动大而不是玩家哪项强
- **接口返回九项，不返回六个角**：六个角怎么由这几项合并在网站决定，调比例不用改接口；基准缺某一项的难度，整局不参与

| 项 | 数据 | 比法 |
|---|---|---|
| `damage` | 英雄伤害 | 每分钟 |
| `gold` | 总金钱 | 每分钟 |
| `participation` | 击杀 + 助攻 | 每分钟 |
| `push` | 推塔 | 每局，总数有上限，按分钟算会让速推局失真 |
| `deaths` | 死亡 | 每分钟，越少越好，百分位反过来算 |
| `tank` | 承受伤害 | 每分钟 |
| `healing` | 给队友的治疗 | 每分钟；0 记 0 分，大于 0 的局只在非 0 段里排名，平均后放大并封顶：多数局没有治疗，不放大治疗型玩家拉不开 |
| `assists` | 助攻 | 每分钟 |
| `stuns` | 眩晕时长 | 每分钟 |

设计取舍见 [docs/design/bigquery/phase-2-radar.md](../design/bigquery/phase-2-radar.md)。

## 每日任务

每天几轮，每轮几个候选选一个，单局达标才算完成。玩法与界面在 game 仓库，这里记前后端怎么分工、为什么。

- **候选由服务端生成，判定与计分在客户端**：候选必须在服务端抽，否则玩家可以自称抽到了最容易的；达标判定与加分沿用结算积分的信任模型（结算经 key 校验），奖励直接计入本局 `battlePoints`。结算时服务端只记一轮完成，不重算候选、不校验 taskId 与数值
- **候选不落库，每次确定性重算**：输入是日期、steamId、轮次、本轮刷新次数与当天已完成的任务，没完成时连续几局算出逐字段相同的候选。只存已完成任务的 `{ taskId, star }`，历史要还原当时的目标与奖励。任务池可以随时改，最坏是玩家下一局看到的候选变了
- **taskId 就是幂等键**：当天完成过的任务不再出现在后续轮次，按任务排除、不分星级；重复上报直接忽略
- **每轮候选固定 1★ / 2★ / 3★ 各一**，必有一个通用、一个英雄专属，第三个随机，两个英雄专属指向不同英雄。固定星级让每轮都有 1★，不会卡在一轮全是难任务；候选在选英雄前下发，玩家可以按任务选英雄
- **只在预设难度生效**：客户端按地图名判断，`custom` 地图与作弊模式不显示、不判定、不上报，玩家不损失轮次。掉线的玩家两端都不算完成、不加分，否则客户端加了分而服务端没记轮次，同一任务能拿两次分
- **日期归属看开局时下发的 `dayId`**，跨午夜的一局算前一天；`dayId` 用 UTC 日界，与排行榜、会员签到一致
- **每轮免费刷新一次，不分会员**：刷新是给抽到不称心任务的补偿，不当付费点。刷新不排除刚才那组，偶尔刷回同一条通用任务：要排除就得回算上一组，生成器不再是单向的纯函数
- **新指标的任务等客户端发布后再进任务池**；客户端拿到不认识的任务或指标时不展示或标为不可完成，不连累同组其他候选
- **客户端不为每日任务加定时器、伤害过滤或高频事件监听**：指标只用结算时能从 `PlayerResource` 一次读出的，10v10 后期事件太密，逐事件回调都是卡顿风险

## 每日任务数值

- **每条任务只配 1★ 目标，2★ / 3★ 按规则推导**：大数值按倍率放大，小整数每星加一档，免得倍率算出重复档。两种都给不出想要的档距时，在任务上写死三档（`starTargets`），首项等于 1★ 目标
- **任务按单局判定，校准看三个数**，三者要一起看。只看完成率会被自选偏差骗：敢选难任务的大多是擅长它的人
  - **按出现次数折算的被选比例**：候选按日期、steamId、轮次、刷新次数确定性生成，服务器不记出现次数，拿生成代码模拟出现概率
  - **选了那局比玩家自己平时多打几分钟**：越多越说明要硬拖时间
  - **全体真人不刻意也能达到 3★ 的比例**：拿来横向比各任务的难度，英雄任务只算该英雄的局
- **「选了哪个任务、完成没有」只有 GA4 事件 `game_end_daily_task` 有**：结算表只记完成的任务，Firestore 也只存完成记录。GA4 只覆盖部分局，按抽样看；战绩和时长以 `game_end_players` 为准，两边按 steamId 加结算时间对齐
- **承伤只算敌方英雄打来的、减伤后的伤害**：小兵、塔、肉山都不计入，所以护甲越厚的英雄这一项反而越低，目标按英雄自己的分布定，不按定位估

校准记录见 [docs/design/daily-task/target-calibration.md](../design/daily-task/target-calibration.md)。

## 成本与延迟

函数跑在 Cloud Run 上，计费方式是**「分配的 vCPU × 请求全时长」**，不看 CPU 实际利用率，等 I/O 的时间照样计费。这条决定了下面几件事。

- **逐玩家的操作一律并发**：串行时请求时长随玩家数线性增长，绝大部分是付费的等待。`Promise.all` 把它压到一次往返的时间
- **慢查询不能放进请求路径**：BigQuery 冷查询是秒级，同步调一次，这个请求的计费比普通 Firestore 请求高一个数量级以上。分析类查询走定时任务预聚合，结果写回 Firestore，接口只读 Firestore
- **Firestore 没有服务端 GROUP BY**，聚合只能把文档全拉到内存里算，读次数随数据量线性涨。需要真聚合的场景同样走预聚合，不要留全表扫描的接口
- **不要调 `cpu` 与 `concurrency`**：`concurrency > 1` 要求 `cpu ≥ 1`；把 `cpu` 降到 1 以下会强制 `concurrency = 1`，I/O 密集场景下反而更贵。`api/index.ts` 用默认值，多个等 I/O 的请求共享同一个实例的计费，对这类负载就是最优解

### 延迟监控

延迟都从日志里算，不接 OpenTelemetry / Cloud Trace：要回答的只是「哪个接口、哪一步慢」「上线前后变了没有」；OTel 在这个部署形态下拿不到 Firestore 的 gRPC 与内置 `fetch` 的子调用，响应后 CPU 限速会丢数据，还拖慢冷启动。出现日志解释不了的慢问题再重新评估。

- **接口级**：Cloud Run 给每个请求自动记一条 `run.googleapis.com/requests` 日志，带耗时与版本号，不需要代码。日志指标 `api_request_latency` 从中抽出按接口分组的耗时分布
- **步骤级**：重点接口里的一级步骤用 `timeStep` 包起来，请求结束时写一条 `request timing` 日志（路由模板、总耗时、各步耗时）。只有包过步骤的请求才写，别的接口要查慢时再包
- **能看多久**：以 `_Default` 日志桶的保留期为准，已开启 Log Analytics，可以用 SQL 查

看板[「API 延迟」](https://console.cloud.google.com/monitoring/dashboards/builder/a65b3812-85dd-49a6-911f-5c1ea58e0188?project=windy10v10ai)的面板、代发路由的并入方式与取值理由都在生成脚本里。两个口径：

- **p50 代替平均值**：平均值会被冷启动这类单次离群拉高
- **上线前后对比看部署时间点前后的曲线高度**：线图用固定窗口平滑，部署后的变化要过一个窗口才完全显现；汇总表与步骤图按看板时间范围统计，切到部署前后各一段即可

看板配置不在控制台里手改，由 [api/scripts/monitoring/api-latency-dashboard.ts](../../api/scripts/monitoring/api-latency-dashboard.ts) 从映射表生成，新增代发路由或计时步骤时在那里的表里加一行，再在 `api/` 下同步：

```bash
ID=a65b3812-85dd-49a6-911f-5c1ea58e0188
ETAG=$(gcloud monitoring dashboards describe $ID --project windy10v10ai --format='value(etag)')
npx ts-node scripts/monitoring/api-latency-dashboard.ts "$ETAG" > /tmp/api-latency-dashboard.json
gcloud monitoring dashboards update $ID --config-from-file=/tmp/api-latency-dashboard.json --project windy10v10ai
```

日志指标的定义存在同目录的 `api-request-latency.metric.yaml`，改了用 `gcloud logging metrics update api_request_latency --config-from-file=...` 同步。命令行查延迟的方法见 [debug-evidence](../../.claude/skills/debug-evidence/SKILL.md) 技能的「查延迟」。

### 告警

一条告警策略「windy10v10ai API Alert」，任一条件满足就发邮件并推送 Cloud Console 手机 App。三个条件各管一类故障：

| 条件 | 抓什么 |
|---|---|
| p95 | 请求到了但变慢 |
| 4xx/5xx 比例 | 请求到了但失败：接口被删、鉴权改错、后端报错、服务起不来 |
| 可用性检测 | 请求到不了 API：`api.windy10v10ai.com` 的域名解析、Cloudflare、证书出问题 |

- **只盯游戏走的那条路**：游戏请求直连 API 域名，可用性检测只测它；网站转发坏了只影响网站页面，用户打开就能发现
- **不按错误日志量告警**：与流量无关，零星报错到不了阈值，大量报错又几乎都伴随 5xx，比例条件先抓到。代价是定时函数失败没有告警
- **4xx 也算失败**：接口被删、鉴权改错这类部署事故返回的是 4xx，只看 5xx 会漏

阈值的取值理由写在配置文件里。告警策略存在 [api/scripts/monitoring/api-alert-policy.yaml](../../api/scripts/monitoring/api-alert-policy.yaml)，改了在 `api/` 下同步：

```bash
gcloud alpha monitoring policies update projects/windy10v10ai/alertPolicies/10525598496095275816 --policy-from-file=scripts/monitoring/api-alert-policy.yaml --project windy10v10ai
```

可用性检测不在策略文件里，建一次即可，告警条件按域名匹配它。Windows 上在 PowerShell 里跑，Git Bash 会把 `--path` 的值改写成本机路径：

```powershell
gcloud monitoring uptime create "API hello" --resource-type=uptime-url --resource-labels=host=api.windy10v10ai.com,project_id=windy10v10ai --protocol=https --path=/api/hello --period=5 --timeout=10 --regions=asia-pacific,usa-oregon,europe --project windy10v10ai
```

## 一致性

系统对两类数据给的保证不一样，这是有意的。

**玩法数据**（战绩、积分、等级、任务进度）只做最终一致：读-改-写，不加事务、不加锁、不做失败补偿。一个玩家同一时刻只在一局游戏里，这些写入天然是顺序发生的，并发覆盖需要两条请求撞在同一个瞬间。真撞上了，代价是丢一次累加或一条记录，玩家继续玩就会被后面的数据盖过去。为这个概率引入事务，换来的是每次写入多一次读、多一条重试路径，以及测试里多一类几乎无法构造的场景。

**金钱**（支付回调、订单激活、退款、会员积分消耗）不走这套。第三方回调会重复投递、会乱序、会在超时后重发，这些不是低概率事件而是常态，必须按幂等来设计。

判断一条新逻辑落在哪边：**出错了玩家会不会损失已经付过的钱**。会 → 按金钱那套做；不会 → 按玩法数据那套做，选最简单能跑通的写法。
