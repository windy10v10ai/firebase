# 网站总体设计

> 背景：[本地主机策略](https://github.com/windy10v10ai/game/blob/develop/docs/design/local-host/README.md) 把加点、洗点、觉醒等账号养成操作迁到网站，玩家用 Steam 登录后操作。本文档是网站重做的总体规划：架构、鉴权、技术方向、分批计划。每一批的细节各自一份子文档，见文末。

## 一句话结论

**网站只做展示和调用，所有数据操作都走现有 NestJS API；用户身份用 Steam OpenID 换 Firebase ID Token，API 按 token 里的 steamId 做归属校验；前端去掉 antd，按游戏界面风格用 Tailwind 重做；先迁移现有页面，再加登录，最后逐项迁养成功能。**

## 1. 现状

| 项目 | 现状 |
|------|------|
| 网站 | Next.js 15 App Router + antd + Tailwind 3 + next-intl，部署在 Firebase App Hosting（windy10v10ai.com） |
| 页面 | 首页、商业披露、爱发电激活、Ko-fi 激活；另有 `pages/`、`products/`、`styles/` 脚手架残留 |
| 网站调 API | 浏览器 → Next 服务端 `/api/[...path]` 转发 → 公网 `api.windy10v10ai.com`；转发不加任何凭据，只能调 `@Public()` 接口 |
| API 鉴权 | 仅 `x-api-key` 请求头，判定为 WINDY / TEST / ANIME / LOCAL 四种服务器类型；`@AllowLocal()` 决定本地主机能否调用；没有用户级身份 |
| 账号养成接口 | 加点、洗点、觉醒都在 `player-info.controller.ts`，只接受官方服务器 key |
| Firebase Auth | 未启用 |

## 2. 总体架构

```
浏览器（React 页面 + Firebase JS SDK）
  │  Steam OpenID 登录跳转 / 回调
  │  ID Token 放在 Authorization 头
  ▼
NestJS API（Cloud Functions，AuthGuard 验 ID Token 或 API key）
  │
  ▼
Firestore
```

- **Next.js** 只负责出页面。用户相关页面在构建时预渲染成静态外壳，数据由浏览器登录后调 API 获取并渲染，服务端不碰用户数据。
- **NestJS API** 是唯一的数据入口。游戏客户端和网站调同一套接口，差别只在鉴权方式。
- **Firebase Auth** 只用来签发和续期 ID Token，网站不直接读写 Firestore。
- **浏览器直连 API**（批次 0 定案）：API 开 CORS 白名单，Next 服务端不再转发。

## 3. 鉴权设计

### 网站用户身份：Firebase ID Token

Steam 只支持 OpenID 2.0，Firebase 没有内置提供商，也不能当通用 OIDC 接。采用 Custom Token 方案：

1. 浏览器跳到 Steam 的 OpenID 登录页，回调地址指向网站。
2. Steam 回调网站，带 `openid.*` 参数。
3. 浏览器把参数交给后端 `POST /api/auth/steam/verify`。后端向 Steam 二次核对（`check_authentication`），并核对回调域名，通过后取出 SteamID64，换算成 32 位账号 ID。
4. 后端用 firebase-admin 签发 Custom Token，uid 就是 32 位账号 ID，与 Firestore 玩家文档 ID 一致。
5. 浏览器用 `signInWithCustomToken` 登录，之后 SDK 自动续期，每次调 API 在 `Authorization: Bearer` 头里带 ID Token。

签发放在 NestJS 后端而不是 Next 服务端：后端已初始化 firebase-admin，逻辑集中，可写 e2e；网站不用引 firebase-admin，也不用给 App Hosting 服务账号加签名权限。

不用 session cookie：cookie 方案是给服务端渲染准备的，用户页面全部客户端渲染，不需要。

### API 侧：扩展现有 AuthGuard

- 请求带 `Authorization: Bearer <ID Token>` → firebase-admin 验签 → 判定为新的服务器类型 `WEB`，并把 uid 记为当前玩家 steamId。
- 请求带 `x-api-key` → 现有逻辑不变。
- 新增 `@AllowWeb()` 装饰器，与 `@AllowLocal()` 同一思路：只有显式声明的路由才接受网站来源。
- `WEB` 来源的请求，路由参数里的 `:steamId` 必须等于 token 的 uid，由 guard 统一拦，玩家只能操作自己的账号。
- 不引入网站专用 API key：ID Token 是 Google 签名的，已能证明「本项目的登录用户」。

### 需要的配置

- Firebase 控制台开启 Authentication（Custom Token 不需要启用任何提供商）。
- `api/index.ts` 的 `client` 函数路径白名单加 `auth` 前缀。
- Steam 侧不需要申请 key；拿昵称头像才需要 Steam Web API key，以后再说。
- 本地开发用 Firebase Auth 模拟器；Steam 允许回调到 localhost。

## 4. 前端技术方向

以下是当前倾向，实现时按子文档再定，不在此定死。

| 项目 | 方向 | 原因 |
|------|------|------|
| 样式 | 去掉 antd，升级 Tailwind 4，用 CSS 变量定义一套取自游戏 Panorama 界面的设计 token（深色底、金色 / 铜色强调、面板边框） | antd 只在激活表单用了三个组件，却带一整套主题系统，与「参考游戏风格」相悖 |
| 组件 | 自建 Button、Panel、Input、Dialog、Table 等一小套 | 后续页面都是表单加面板，够用 |
| 字体 | Noto Sans SC 加一个衬线标题字体 | 游戏里的 Radiance 是 Valve 字体，不能在网站使用 |
| 数据层 | 倾向 TanStack Query，SWR 备选 | 核心交互是「看属性 → 加点 → 属性和积分一起刷新」，变更后失效缓存的模式正好对应 |
| 登录状态 | `AuthProvider` 包住 Firebase SDK 的 `onAuthStateChanged`，页面从 context 拿当前用户 | 查询 key 带 uid，切换账号缓存自动隔离 |
| API 调用 | 一个 `apiFetch` 负责拼域名、带 token、转错误；每个资源一个 hook；页面只管未登录 / 加载中 / 有数据三种状态 | 分层清楚，页面不直接碰 fetch |

### 渲染方式

| 页面 | 方式 | 原因 |
|------|------|------|
| 首页、商业披露、激活页外壳 | 构建时静态生成 | 没有用户数据，最快，可被搜索 |
| 我的、属性、觉醒、会员 | 静态外壳 + 浏览器登录后调 API | 要登录才能看，不需要 SEO |
| 排行榜（如果上网站） | ISR | 公开但会变，唯一适合 ISR 的场景 |

## 5. 已定决策

- 网站不直接访问数据库，所有操作走 API。
- 用户身份：Steam OpenID + Firebase Custom Token，API 验 ID Token，不加网站专用 key。
- Custom Token 由 NestJS 后端签发。
- 用户页面客户端渲染，不做 SSR。
- 去 antd，Tailwind 4 加自建组件，风格参考游戏界面。
- 激活页在登录后自动填入 Dota2 ID（等于 uid），未登录仍可手填，激活接口保持 Public。
- 先迁移现有页面到新框架并上线验证，再加登录，最后迁养成功能。
- 不做「记录」页：后端没有积分流水，只有当日限额计数；要做得新建集合并在每处积分变动加写入，价值不够。
- 会员页排最后：本地主机已能购买会员，网站只是第二入口。

## 6. 浏览器到 API 的路径

**直连**，批次 0 已验证定案，取舍与验证记录见 [phase-0-api-access.md](phase-0-api-access.md)。

- API 的 CORS 白名单收正式域名、prod / dev 两个 App Hosting 域名和 `http://localhost:3000`，预检缓存 24 小时。
- 网站不再有任何 API 转发路由，域名由 `NEXT_PUBLIC_API_DOMAIN` 在构建期注入。
- 本地开发把它指向 `http://localhost:3001` 就能跳过 emulator。

## 7. 分批计划

| 批次 | 跟踪 issue | 内容 | 验收 | 子文档 |
|------|------|------|------|--------|
| 0 API 访问路径 | 已完成（PR #1114） | 验证浏览器直连 API（CORS、预检、白名单、本地开发）与 Next 转发的差异，定下方案 | 两种方式都在线上跑通一次公开接口，写下决定 | [phase-0-api-access.md](phase-0-api-access.md) |
| 1 新框架迁移 | #1117 | 清残留与移动端布局修复、Next 16、Tailwind 4 + 设计 token + 基础组件、去 antd + `apiFetch`、React 19，拆成 1a–1e 五次上线 | 线上四个页面正常，手机能完成激活，antd 已移除 | [phase-1-migration.md](phase-1-migration.md) |
| 2 Steam 登录 | #1118 | 后端 `auth` 模块、guard 支持 ID Token、`@AllowWeb()`；网站 Firebase SDK、登录 / 回调、`AuthProvider`、头部登录按钮；激活页自动填 ID；「我的」页面（`GET /player/:id/info` 加 `@AllowWeb`） | 登录后激活页自动填 ID，「我的」页面能看到会员和属性 | `phase-2-steam-login.md`；登录入口交互见 [phase-2-login-entry.md](phase-2-login-entry.md) |
| 3a 属性面板 | #1119 | 查看、加点、洗点 | 接口加 `@AllowWeb` 与归属校验；e2e 覆盖「用别人 steamId 调被拒」 | `phase-3a-property.md` |
| 3b 觉醒 | #1120 | 已觉醒列表、解锁、随机 | 同上 | `phase-3b-awakening.md` |
| 4 游戏联动 | windy10v10ai/game#2411 | game 仓库：「前往网站」按钮、刷新按钮、FAQ | 网站操作后回游戏刷新能看到结果 | `phase-4-game-sync.md` |
| 5 GA4 | #1122 | 网站接入 GA4 | 线上能看到页面访问事件 | `phase-5-ga4.md` |
| 6 会员 | #1123 | 积分、到期时间、支付宝二维码购买 | 同 3a | `phase-6-membership.md` |

批次 0、1、2 顺序执行。3a、3b 互相独立，3a 先做，它直接对应加点被禁的痛点。4 要等 3a、3b 上线。5、6 不急，按序排在后面。

### 子文档写什么

每份子文档在开工前写，内容限于该批次：

- 目标与验收标准
- 涉及的接口与鉴权改动（新增路由、装饰器、白名单）
- 页面与组件清单
- 测试清单（unit / e2e / 线上验证）
- 该批次内需要拍板的技术选择

主文档只在决策变更时更新，不重复子文档内容。
