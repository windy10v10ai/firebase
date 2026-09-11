# 批次 0：浏览器到 API 的访问路径

> 上级文档：[网站总体设计](README.md) 第 6 节「待验证」。本批次只回答一个问题：**浏览器直连 API（开 CORS）还是保留 Next 转发**。验证完成后把结论写回本文末尾和主文档。

## 一句话结论

**两种方式都能在本地验证，直连方案的核心风险（预检、白名单、CDN 缓存）本地能覆盖大半，剩下的 CDN 行为用网站 dev 环境对着线上 API 验。** 决定见文末「结论」，验证前不预设答案。

## 1. 目标与验收

目标：定下浏览器调 API 的唯一路径，后续所有批次照此实现。

验收：

- 两种路径都在网站 dev 环境跑通一次公开接口（`GET /api` 与 `POST /api/afdian/order/active`）。
- 直连路径额外验证：带 `Authorization` 头的请求，预检通过、业务返回 401 时浏览器仍能读到响应体。
- 本文「结论」一节填上决定与理由，主文档第 2、6 节同步更新。

## 2. 现状（2026-09-11 实测）

线上请求链：

```
浏览器
  → Cloudflare（api.windy10v10ai.com 走代理，cf-cache-status: DYNAMIC）
  → Firebase Hosting（rewrite ^/api/.* → client 函数，asia-northeast1）
  → api/index.ts 路径白名单（只看路径，不看方法）
  → NestJS
```

- 对 `/api/player/ranking` 发预检 `OPTIONS`（带 `Origin`）：返回 **404 `Cannot OPTIONS`**，响应头有 `x-powered-by: Express`。说明预检已经穿过 Cloudflare、Hosting 和白名单到达 Nest，只是 Nest 没开 CORS，没有任何 `Access-Control-*` 头。
- 网站在 App Hosting（asia-east1），有 `prod` 和 `dev` 两个后端；API 函数在 asia-northeast1。无论哪种路径，网站到 API 都要跨区域一次。
- 网站现在只用两条专用路由 `/api/afdian`、`/api/kofi` 转发激活请求；通用转发路由 `/api/[...path]` 没有任何页面在调。三个 route 文件都只为了打日志引入了 `firebase-functions` 包。
- API 只有一个线上环境。CORS 改动一旦部署就是生产，但它只加响应头，不改业务逻辑。

## 3. 两种方案

### 方案 A：浏览器直连 API

浏览器用 `NEXT_PUBLIC_API_DOMAIN` 直接请求 `api.windy10v10ai.com`，Next 服务端不再有任何 API 路由。

需要改的地方：

- Nest 开 CORS：在 `AppGlobalSettings` 里 `app.enableCors`，白名单放正式域名、App Hosting 的 prod / dev 域名、`http://localhost:3000`；允许头 `Authorization`、`Content-Type`；`credentials: false`（身份走 Bearer 不走 cookie）；`maxAge` 给到 24 小时让浏览器缓存预检。放在 `AppGlobalSettings` 而不是 `onRequest` 的 `cors` 选项，是为了本地 `npm run start` 和 e2e 走同一份配置。
- 网站：删掉三个 route 文件和 `firebase-functions` 依赖，激活表单改调 `/api/afdian/order/active`；`API_DOMAIN` 改成 `NEXT_PUBLIC_API_DOMAIN`（构建期注入，App Hosting 的两个后端各配一份）。
- 白名单：预检的路径与真实请求相同，现有前缀不用动；批次 2 加 `auth` 前缀时预检自然一起放行。

利弊：

| 利 | 弊 |
|----|----|
| 少一跳（少经过 App Hosting 的 Cloud Run 实例），网站服务端零动态代码 | 每个带 `Authorization` 或 JSON body 的请求都是「非简单请求」，首次要一次预检；预检也是一次 Cloud Function 调用（有 24 小时缓存，量很小） |
| 删掉三个 route 文件和 `firebase-functions` 依赖，错误码、响应体原样到浏览器 | CORS 白名单要维护域名清单，新增域名要改 API |
| 本地开发可以直接指 `localhost:3001`，跳过 emulator | 预检响应经过 Cloudflare 和 Hosting 的 CDN，要确认没被缓存串源（依赖 `Vary: Origin`） |
| API 的 401 / 403 直接暴露给页面，登录态处理更直接 | 无 |

### 方案 B：保留 Next 转发

浏览器请求同源 `/api/...`，Next 的 `[...path]` 路由转发到 API。

需要改的地方：

- 转发路由目前把浏览器的全部请求头原样转发，`Authorization` 已经能透传，不用改。
- 删掉 `/api/afdian`、`/api/kofi` 两条专用路由，统一走 `[...path]`（或者保留，改动为零）。

利弊：

| 利 | 弊 |
|----|----|
| 同源，没有 CORS、没有预检 | 多一跳：浏览器 → App Hosting（台湾）→ Cloudflare → 函数（东京），每个 API 调用都占一次 Next 服务端 CPU |
| 将来要放服务端秘密时有地方放（目前没有这个需求） | 转发代码要维护：响应体类型判断、错误包装成 500 会盖掉 API 原始错误 |
| 本地开发流程不变 | 网站继续依赖 `firebase-functions` 包 |

## 4. 能不能在本地验证

**能，而且直连方案的本地环境天然就是跨域的。**

| 组件 | 本地 | 说明 |
|------|------|------|
| 网站 | `localhost:3000` | `cd web && npm run dev` |
| API（直连 Nest） | `localhost:3001` | `cd api && npm run start`，不经过白名单 |
| API（模拟线上链路） | `localhost:5000` | 根目录 `npm run start:firebase` 起 functions + hosting + firestore emulator；hosting emulator 会复现 `^/api/.*` rewrite 和 `index.ts` 白名单。functions emulator 跑的是 `api/dist/index.js`，起之前先 `cd api && npm run build` |

3000 对 3001 或 5000 就是不同源，浏览器会真的发预检，DevTools 里能看到 `OPTIONS` 和后续请求。方案 B 的本地流程就是现在的流程，`.env.local` 已经指向 `localhost:5000`。

本地验不了的三件事，留给线上 dev 环境：

1. Cloudflare 与 Hosting CDN 对预检响应的缓存行为（`Vary: Origin` 是否生效）。
2. App Hosting 构建期注入 `NEXT_PUBLIC_API_DOMAIN` 是否正确。
3. 两种路径的真实延迟差。

## 5. 验证步骤

### 5.1 方案 A 本地

1. API 加 `enableCors`，白名单先只放 `http://localhost:3000`。
2. 起 `npm run start:firebase`（无 `firestore-backup/` 时去掉 `--import`）和 `npm run dev`，网站 `.env.local` 设 `NEXT_PUBLIC_API_DOMAIN=http://localhost:5000`。
3. 在任意页面执行三次 `fetch`：
   - `GET /api`（Public）：预期 200，响应头有 `Access-Control-Allow-Origin`。
   - `POST /api/afdian/order/active` 传假数据：预期先有 `OPTIONS` 204，再有 `POST` 返回 4xx，浏览器能读到 JSON 错误体。
   - `GET /api/player/ranking` 带 `Authorization: Bearer x`：预期 `OPTIONS` 204，`GET` 401，且 401 响应仍带 CORS 头（cors 中间件在 guard 之前执行）。
4. 改 Origin 为不在白名单的值再发一次，预期浏览器报 CORS 错误。
5. 把 `NEXT_PUBLIC_API_DOMAIN` 换成 `http://localhost:3001` 重复第 3 步，确认跳过 emulator 的开发流程也可用。

### 5.2 方案 B 本地

现有流程已经在用，只补两项：

1. 通过 `/api/player/ranking` 带 `Authorization` 头发请求，确认头被透传到 API（API 日志或 401 说明到了 guard）。
2. 让 API 返回 4xx，确认浏览器拿到的状态码和响应体与 API 一致，没被转发层包成 500。

### 5.3 线上 dev 环境

1. 确认 App Hosting `dev` 后端绑定的分支，把改动推到该分支。
2. API 的 CORS 白名单加上 `https://dev--windy10v10ai.asia-east1.hosted.app`，部署 API。
3. 在 dev 站点重复 5.1 第 3 步；额外用 `curl -X OPTIONS` 带两个不同 `Origin` 连发，确认返回的 `Access-Control-Allow-Origin` 跟随请求而不是命中 CDN 缓存。
4. 延迟对比：同一个公开 `GET` 各发 20 次，记录直连与转发的中位 TTFB，写进「结论」。

## 6. 测试清单

- [ ] e2e：`OPTIONS` 带白名单内 `Origin` 返回 204 且带 `Access-Control-Allow-Origin` / `Allow-Headers` 含 `authorization`
- [ ] e2e：白名单外 `Origin` 不返回 `Access-Control-Allow-Origin`
- [ ] e2e：未带 key 的 `GET` 返回 401 时仍带 CORS 头
- [ ] 本地 5.1 全部步骤
- [ ] 本地 5.2 全部步骤
- [ ] dev 环境 5.3 全部步骤
- [ ] `cd api && npm run lint && npm run test && npm run test:e2e`

## 7. 本批次要拍板的点

- CORS 白名单里放不放 App Hosting 的 `prod--*.hosted.app` 默认域名（正式域名之外的备用入口）。
- 选方案 A 时，`/api/afdian`、`/api/kofi` 两条专用路由是在本批次删，还是留到批次 1 随激活页重写一起删。
- 选方案 B 时，`[...path]` 的错误处理是否改成原样透传状态码。

## 结论

待验证后填写：选定方案、延迟数据、发现的问题。
