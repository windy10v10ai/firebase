# 批次 2：Steam 登录

> 上级文档：[网站架构](../../web/README.md) 的「鉴权设计」与「页面与菜单」。进度跟踪：windy10v10ai/firebase#1118。登录按钮放哪、未登录页面长什么样，见 [phase-2-login-entry.md](phase-2-login-entry.md)，本文不重复。
>
> 全部已上线，只留仍然有效的决定。

## 一句话结论

**拆成六步、四次上线：后端先做「换 token」的接口，再让 guard 认这个 token；网站接上登录跳转、门禁与个人主页、激活页自动填 ID。**

## 1. 目标

玩家在网站上用 Steam 证明「我是这个 Dota2 账号的主人」，此后网站调 API 就能带上这个身份。本批次只做到「能登录、能看到自己的数据」，加点洗点觉醒是批次 3。

## 2. 登录流程

```
浏览器                      Steam                     NestJS API
  │                          │                           │
  │ 1 跳转到 OpenID 登录页    │                           │
  ├─────────────────────────>│                           │
  │ 2 带 openid.* 参数回调    │                           │
  │<─────────────────────────┤                           │
  │ 3 把参数交给后端                                      │
  ├──────────────────────────────────────────────────────>│
  │                          │  3' 二次核对签名           │
  │                          │<──────────────────────────┤
  │                          ├──────────────────────────>│
  │ 4 返回 Custom Token                                   │
  │<──────────────────────────────────────────────────────┤
  │ 5 换成 ID Token，之后每次请求带在 Authorization 头      │
  ├──────────────────────────────────────────────────────>│
```

三个关键点：

- **跳转链接由前端拼**。OpenID 的请求参数是固定的，不需要后端参与，少一次往返。
- **后端必须二次核对**。回调参数是从浏览器地址栏来的，可以伪造，只有向 Steam 发 `check_authentication` 才能确认签名有效。同时要核对回调域名，防止别人拿我们的接口给自己的站签 token。
- **uid 就是 32 位账号 ID**。Steam 给的是 SteamID64，换算后与 Firestore 玩家文档 ID 一致，后续所有归属校验都比这一个值。

## 3. 六步与依赖

| 步 | 侧 | 做什么 | 状态 |
|---|---|---|---|
| **2a** 登录接口 | API | `auth` 模块，`POST /api/auth/steam/verify`：核对签名与回调域名、换算 ID、签发 Custom Token | 已完成 #1144 |
| **2b** 网站来源鉴权 | API | guard 认 ID Token，新增来源类型 `WEB` 与 `@AllowWeb()`，校验路由里的 `:steamId` 等于 token 的 uid | 已完成 #1149 |
| **2c** 开第一个接口 | API | `GET /player/:steamId/info` 挂 `@AllowWeb()` | 已完成 #1149 |
| **2d** 登录跑通 | web | Firebase JS SDK、登录态 context、头部登录按钮、回调页、请求带 token | 已完成 #1150 |
| **2e** 门禁与个人主页 | web | `/my/*` 入口页与未登录面板、`/profile/<steamId>` 个人主页、头部 ID 按钮进主页 | 已完成 #1158 |
| **2f** 激活页自动填 ID | web | 登录后把 uid 填进 Dota2 ID 字段 | 已完成 #1158 |

2e 与 2f 合一个 PR：2f 只有一个链接加一次填值，单独走一轮流程不划算。

## 4. API 侧架构

做法见 [auth.controller.ts](../../../api/src/auth/auth.controller.ts)、[auth.guard.ts](../../../api/src/util/auth/auth.guard.ts)。这里只留没写进代码的决策：

- 归属校验（路由里的 `:steamId` 必须等于 token 的 uid）放在 guard 统一拦，不放各个 controller——这条规则一旦有一处漏写就是越权
- 归属校验不通过返回 **403**，token 无效才是 401。网站靠这两个码区分「需要登录」和「这个人的资料看不了」
- 新接口要接受网站来源，必须显式挂 `@AllowWeb()`，默认不放行；忘挂的后果是网站带 `Authorization` 头的请求一律 401（已记入 [api/CLAUDE.md](../../../api/CLAUDE.md) 常见坑，日常开发查那份）
- Steam 侧不需要申请任何 key；拿昵称头像才需要 Steam Web API key，单独排一批

本批次只开 `GET /player/:steamId/info` 一个接口。属性、觉醒那几个写接口等批次 3，那时每开一个都要配一条「用别人的 steamId 调被拒」的 e2e。

## 5. 网站侧架构

四层，各管一件事：

| 层 | 职责 | 状态 |
|---|---|---|
| 登录态 context | 包住 Firebase SDK 的登录状态订阅，对外给出加载中 / 未登录 / 已登录三种状态 | [auth.tsx](../../../web/app/lib/auth.tsx) |
| `apiFetch` | 有登录态就带上 `Authorization` 头 | [api.ts](../../../web/app/lib/api.ts) |
| 门禁 | 未登录的处理集中在 `/my/*` 一处；`/profile/<id>/*` 不判断登录，由接口决定看不看得到 | [my/[[...path]]/page.tsx](../../../web/app/my/%5B%5B...path%5D%5D/page.tsx) |
| 页面 | 只管展示，按 URL 里的 steamId 取数据，不从登录态取 uid | [profile/[steamId]/page.tsx](../../../web/app/profile/%5BsteamId%5D/page.tsx) |

跳转链接的拼法和回调页见 [steam-login.ts](../../../web/app/lib/steam-login.ts)、[callback/page.tsx](../../../web/app/login/callback/page.tsx)。

个人主页放哪些区块、菜单怎么排、路径为什么带 steamId，见[网站架构](../../web/README.md)的「页面与菜单」。门禁为什么集中在 `/my/*`、未登录时为什么原地显示面板而不跳登录页、登录后怎么回到原来的页面，见 [phase-2-login-entry.md](phase-2-login-entry.md)。

登录态由 Firebase SDK 自己持久化和续期，网站不存 token，也不写 cookie。这也意味着服务端看不见登录态，门禁只能在浏览器里做，Next 的 middleware 帮不上忙。

## 6. 配置

| 项 | 说明 | 状态 |
|---|---|---|
| Firebase 控制台开启 Authentication | Custom Token 不需要启用任何提供商，但 Auth 服务本身要开 | 已开 |
| `api/index.ts` 路径白名单加 `auth` | 否则 Functions 不会把 `/api/auth/*` 转给 NestJS | 已加 |
| 网站的 Firebase 前端配置 | 以 `NEXT_PUBLIC_*` 在构建期注入 | 已配 |
| 运行时服务账号的 `signBlob` 权限 | `createCustomToken` 要用它给 token 签名。默认没有，要给 `<项目编号>-compute@developer.gserviceaccount.com` 授予自身的 Service Account Token Creator 角色，否则线上登录报 `Permission 'iam.serviceAccounts.signBlob' denied` | 已授权 |

## 7. 本批次拍板的技术选择

| 选择 | 结论 | 理由 |
|---|---|---|
| Custom Token 谁签 | **NestJS 后端** | 后端已初始化 firebase-admin，逻辑集中、可写 e2e；网站不用引 admin SDK |
| 会话形式 | **不用 session cookie** | cookie 是给服务端渲染准备的，用户页面全部客户端渲染 |
| 网站专用 API key | **不加** | ID Token 由 Google 签名，已经能证明「本项目的登录用户」 |
| 昵称与头像 | **本批次不做** | 要 Steam Web API key，头部显示 ID 先够用 |
| e2e 怎么验 ID Token | **用 Firebase Auth 模拟器** | token 的签发与验签都走真实路径，只有 Steam 那次外部核对需要打桩 |
| 数据层 | **实现属性页时定** | 本批次只有一个读接口，缓存和失效的需求要到批次 3 才真正出现 |

## 8. 不在本批次

- 加点、洗点、觉醒——批次 3
- 昵称、头像等任何需要 Steam Web API key 的数据——单独一批
- 排行榜、会员购买、账号绑定与解绑
