# 批次 0：浏览器到 API 的访问路径

> 状态：已完成。总体架构见 [docs/web/README.md](../../web/README.md) 第 1 节；CORS 白名单与预检配置的真相源是 `AppGlobalSettings`，本地开发怎么覆盖域名见 [web/CLAUDE.md](../../../web/CLAUDE.md)。

## 决定

- **浏览器直连 API，网站服务端不做任何转发**：转发层当时没有承担任何逻辑——通用转发路由无人调用，两条专用路由只是把 JSON 原样再发一次，还会把 API 的错误包成 500。直连少一跳，401 / 403 直接到页面。代价是每个非简单请求首次多一次预检，浏览器缓存 24 小时。实测中位 TTFB 0.167 秒对 0.341 秒
- **CORS 配在 `AppGlobalSettings` 里，不在 `onRequest` 的 `cors` 选项里**：这样本地启动、Cloud Functions、e2e 三处共用同一份，e2e 能覆盖白名单
- **`credentials: false`**：身份走 Bearer 头不走 cookie
- **`www.windy10v10ai.com` 不进白名单**：它 302 跳到不带 www 的域名，浏览器最终停在后者
- **域名用 `NEXT_PUBLIC_API_DOMAIN` 构建期注入**，两个 App Hosting 后端共用同一个值——API 只有一个线上环境，不需要分别配置

**对游戏客户端没有影响。** CORS 由浏览器执行，服务器只是多加几个响应头；游戏的请求不带 `Origin`，中间件原样放过。即使带了白名单外的 `Origin`，中间件也只是不加头，不会拒绝请求。
