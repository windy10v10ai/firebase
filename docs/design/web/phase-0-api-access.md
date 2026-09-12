# 批次 0：浏览器到 API 的访问路径

> 上级文档：[网站总体设计](README.md) 的「总体架构」。已实现并发布，本文只留仍然有效的决定与约束。

## 结论

**浏览器直连 API，网站服务端不做任何转发。**

转发层当时没有承担任何逻辑：通用转发路由无人调用，两条专用路由只是把 JSON 原样再发一次，还会把 API 的错误包成 500。批次 2 起所有用户请求都带 `Authorization` 头，直连少一跳，401 / 403 直接到页面。代价是每个非简单请求首次多一次预检，浏览器缓存 24 小时。

线上请求链：

```
浏览器
  → Cloudflare（api.windy10v10ai.com 走代理）
  → Firebase Hosting（rewrite ^/api/.* → client 函数，asia-northeast1）
  → api/index.ts 路径白名单（只看路径，不看方法）
  → NestJS
```

## CORS 配置

配置在 `AppGlobalSettings` 里，不在 `onRequest` 的 `cors` 选项里——这样本地 `npm run start`、Cloud Functions、e2e 三处共用同一份，e2e 能覆盖白名单。

白名单四项：

- `https://windy10v10ai.com`
- `https://prod--windy10v10ai.asia-east1.hosted.app`
- `https://dev--windy10v10ai.asia-east1.hosted.app`
- `http://localhost:3000`

允许头 `Authorization` 与 `Content-Type`，预检缓存 24 小时，`credentials: false`（身份走 Bearer 不走 cookie）。

`www.windy10v10ai.com` 不进白名单：它 302 跳到不带 www 的域名，浏览器最终停在后者。

**对游戏客户端没有影响。** CORS 由浏览器执行，服务器只是多加几个响应头。游戏的请求不带 `Origin`，`cors` 中间件原样放过；即使带了白名单外的 `Origin`，中间件也只是不加头，不会拒绝请求。

## 域名注入

网站用 `NEXT_PUBLIC_API_DOMAIN`，构建期注入。两个 App Hosting 后端共用 `web/.env` 的同一个值——API 只有一个线上环境，不需要分别配置。本地开发覆盖方式见 [web/CLAUDE.md](../../../web/CLAUDE.md)。

## 两个坑

1. **裸 `/api` 在线上到不了。** Hosting rewrite 是 `^/api/.*`，函数白名单是 `^/api/(game|afdian|...)`，两个都不匹配 `/api`，实测 404。要探活用 `GET /api/player/ranking`。
2. **functions emulator 会伪造 CORS 头。** 它对所有请求套了一层 `cors({ origin: true })`，预检由它直接答，任何 `Origin` 都放行。所以经 `localhost:5000` 的链路只能验通路，验不了白名单——白名单以 e2e（直接跑 Nest）和线上为准。

## 实测延迟

同一个公开 `GET` 各发 15 次，中位 TTFB：直连 0.167 秒，经网站转发 0.341 秒。测量点在开发者本机，不代表玩家所在地区，但两条路径条件相同。
