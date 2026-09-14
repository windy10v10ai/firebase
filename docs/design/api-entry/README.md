# API 入口域名

> 状态：进行中，对应 [#1195](https://github.com/windy10v10ai/firebase/issues/1195)。入口清单落地后写进 [docs/api/README.md](../../api/README.md)，本文只留取舍。

浏览器、游戏服务器、三个收款平台各自从不同域名进同一个 Cloud Functions，谁走哪条从没记录过。中国玩家打不开 `api.windy10v10ai.com` 导致登录失败，借这次把入口收敛。

## 现状与终态

| 来源 | 现在 | 终态 |
|---|---|---|
| 网站浏览器 | `api.windy10v10ai.com` | `windy10v10ai.com`（同源，经 Next 转发） |
| 支付宝回调 | `windy10v10ai.com` | `api.windy10v10ai.com` |
| 爱发电 / Ko-fi 回调 | `windy10v10ai.web.app` | `api.windy10v10ai.com` |
| 游戏服务器 | `api.windy10v10ai.com` | 不变 |

终态是两个域名各有明确的主人：`windy10v10ai.com` 服务浏览器，`api.windy10v10ai.com` 服务所有服务端来源。

## 决定

- **网站页面改走同源**：干扰绑在域名上（DNS 污染、SNI 阻断、加速器只覆盖主域名都符合现象），页面能打开就说明主域名这条连接是通的。同源顺带省掉每次首访的 CORS 预检
- **转发沿用 Next 的 rewrite**：它是声明式纯透传。改写成 route handler 会重蹈 [phase-0-api-access.md](../web/phase-0-api-access.md) 里「把 API 的错误包成 500」的覆辙
- **不加自动重试**：`apiFetch` 是所有请求的公共壳，一视同仁地重试会碰到加点、洗觉醒这类花积分的 POST。登录页第 2 步本来就有退避重试，第 1 步失败给「重新登录」按钮
- **转发目的地直接打函数地址**：转发到 `api.windy10v10ai.com` 会二次穿 Cloudflare 再进 Firebase Hosting，实测每层几十毫秒，且这条路有约 0.5% 的 500，同期直连为零
- **外部回调统一到自己的域名，不用 `web.app`**：`web.app` 是 Firebase 给的名字，我们控制不了；回调地址配在外部平台控制台里，改一次成本高，要压在能自己调 DNS 的域名上
- **CORS 白名单不动**：它同时是 Steam 回调地址的白名单（`isAllowedReturnTo`），删了登录直接挂；保留也是同源改动的回滚余地

## 任务

### 第 1 步：网站页面改走同源

- `web/app/lib/api.ts`：请求地址改成相对路径
- `web/config/constant.ts`：删掉浏览器侧的 API 域名常量与它的 dev 打印
- `web/.env`、`web/.env.development`：`NEXT_PUBLIC_API_DOMAIN` 改名为服务端变量，值不变
- `web/next.config.ts`：读新变量名；`/api` 那条 rewrite 的注释补上支付宝回调
- `docs/web/README.md` 第 1 节：现在写着「浏览器直连 API，网站服务端不做转发」，按新结论改写
- `docs/design/web/phase-0-api-access.md`：补上这次因可达性改回转发
- `docs/api/README.md`：新增「对外入口」一节；修掉里面过时的重写正则（写的是四个前缀，实际九个）
- `api/CLAUDE.md`、`web/CLAUDE.md`：各加一条约束——网站的 `/api` 转发是支付宝回调的生产链路，环境变量表同步更新

验证：`npm run lint && npx tsc --noEmit && npm run build`，本地走真实 Steam 登录与各数据页，再部署 dev 后端复测。上线后确认生产 `/api/*` 是 `cf-cache-status: DYNAMIC`。

### 第 2 步：支付宝回调改到 api 域名

- 先确认 notify URL 是支付宝控制台的应用网关生效还是请求参数生效
- `api/.env.windy10v10ai` 的 `ALIPAY_NOTIFY_URL` 改到 `api.windy10v10ai.com`
- 支付宝开放平台控制台同步改（沙箱与生产各一处）
- `docs/design/alipay-payment/README.md`：那句「代码里不再读取 `ALIPAY_NOTIFY_URL`」和代码矛盾，修掉

验证：真实下一笔小额订单，确认回调到账、会员生效。之后连看几天订单数与回调数是否对得上——一次成功只说明通，对得上才说明稳。

### 第 3 步：转发目的地换成函数地址

- `web/.env`：转发目的地改成 Cloud Run 上的函数地址
- `docs/api/README.md`：链路图更新

依赖第 1 步：在它之前，同一个变量同时决定浏览器拨哪个域名和转发发给谁，改值会让浏览器直接去打函数地址。

影响面还包括走网站域名的那部分游戏服务器请求。做完第 2 步后不再牵涉支付。

### 第 4 步：爱发电与 Ko-fi 回调改到 api 域名

- 两个平台的控制台各改一处 webhook 地址
- `docs/api/README.md`：入口表更新

排在最后：它们现在走 `web.app`，路更短，爱发电还有每 30 分钟的对账兜底，不急。等支付宝在 api 域名上稳住一段时间再搬。

## 不做

- 不把游戏服务器从 `api.windy10v10ai.com` 搬走：它不经过 Next，没有收益
- 不改 CORS 白名单
- 不给支付宝补对账兜底：本次范围外，见后续事项

## 后续事项

- **支付宝回调没有任何兜底**：`getOrderStatus` 只读本地订单状态，定时对账只覆盖爱发电。回调丢了就是玩家付钱不到账且无告警。第 2 步之后的观察期靠人工对数，补兜底另开
