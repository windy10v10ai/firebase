# API 入口域名

> 状态：已完成，对应 [#1195](https://github.com/windy10v10ai/firebase/issues/1195)。入口清单见 [docs/api/README.md](../../api/README.md) 的「对外入口」。

浏览器、游戏服务器、三个收款平台各自从不同域名进同一个 Cloud Functions，谁走哪条从没记录过。中国玩家打不开 `api.windy10v10ai.com` 导致登录失败，借这次把入口收敛成两个各有主人的域名：`windy10v10ai.com` 服务浏览器，`api.windy10v10ai.com` 服务所有服务端来源。

## 决定

- **网站页面改走同源**：干扰绑在域名上（DNS 污染、SNI 阻断、加速器只覆盖主域名都符合现象），页面能打开就说明主域名这条连接是通的。同源顺带省掉每次首访的 CORS 预检
- **转发沿用 Next 的 rewrite**：它是声明式纯透传。改写成 route handler 会重蹈 [phase-0-api-access.md](../web/phase-0-api-access.md) 里「把 API 的错误包成 500」的覆辙
- **不加自动重试**：`apiFetch` 是所有请求的公共壳，一视同仁地重试会碰到加点、洗觉醒这类花积分的 POST。登录页第 2 步本来就有退避重试，第 1 步失败给「重新登录」按钮
- **转发目的地打函数自己的地址**：转发到 `api.windy10v10ai.com` 会二次穿 Cloudflare 再进 Firebase Hosting，实测每层几十毫秒，且这条路有约 0.5% 的 500，同期直连为零
- **函数地址取 `cloudfunctions.net` 而非 `run.app`**：两条路由实测等价，前者由区域、项目 ID、函数名拼成，后者带一串项目哈希，日后看不出还有没有效
- **外部回调统一到自己的域名，不用 `web.app`**：`web.app` 是 Firebase 给的名字，我们控制不了；回调地址配在外部平台控制台里，改一次成本高，要压在能自己调 DNS 的域名上
- **CORS 白名单不动**：它同时是 Steam 回调地址的白名单（`isAllowedReturnTo`），删了登录直接挂；保留也是同源改动的回滚余地

## 不做

- 不把游戏服务器从 `api.windy10v10ai.com` 搬走：它不经过 Next，没有收益
- 不改 CORS 白名单
- 不给支付宝补对账兜底：见后续事项

## 后续事项

三个收款平台的回调仍在原来的域名上，搬迁交给[批次 6 会员剩余](../web/README.md)——那个批次本来就要下真实订单，回调通不通当场能验，不必为验证单独下单。

- **支付宝**从 `windy10v10ai.com` 改到 `api.windy10v10ai.com`：先确认 notify URL 是支付宝控制台的应用网关生效还是请求参数生效，再改 `api/.env.windy10v10ai` 的 `ALIPAY_NOTIFY_URL` 与控制台（沙箱、生产各一处）。`docs/design/alipay-payment/README.md` 里「代码里不再读取 `ALIPAY_NOTIFY_URL`」与代码矛盾，一并修掉
- **爱发电与 Ko-fi** 从 `windy10v10ai.web.app` 改到 `api.windy10v10ai.com`：两个平台的控制台各改一处 webhook 地址。它们现在的路更短，爱发电还有每 30 分钟的对账兜底，可以排在支付宝之后
- **支付宝回调没有任何兜底**：`getOrderStatus` 只读本地订单状态，定时对账只覆盖爱发电。回调丢了就是玩家付钱不到账且无告警，补兜底另开
