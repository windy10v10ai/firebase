# 网站架构

> 背景：[本地主机策略](https://github.com/windy10v10ai/game/blob/develop/docs/design/local-host/README.md) 把加点、洗点、觉醒等账号养成操作迁到网站，玩家用 Steam 登录后操作。本文是网站长期有效的架构、鉴权、页面与菜单、技术方向；只在决策变更时更新，不因批次完成而增删。各批次的具体设计与进度见 [docs/design/web/](../design/web/README.md)。

## 一句话结论

**网站只做展示和调用，所有数据操作都走现有 NestJS API；用户身份用 Steam OpenID 换 Firebase ID Token，API 按 token 里的 steamId 做归属校验；前端按游戏界面风格用 Tailwind 重做。**

## 1. 总体架构

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
- **浏览器直连 API**，API 开 CORS 白名单，网站服务端不做转发。细节见 [phase-0-api-access.md](../design/web/phase-0-api-access.md)。

## 2. 鉴权设计

做法见 [phase-2-steam-login.md](../design/web/phase-2-steam-login.md)。这里只留结论：

- 玩家在 Steam 的 OpenID 页登录，后端二次核对签名后签发 Firebase Custom Token，浏览器换成 ID Token，之后每次调 API 带在 `Authorization: Bearer` 头里。
- **uid 就是 32 位账号 ID**，与 Firestore 玩家文档 ID 一致，所有归属校验都比这一个值。
- API 侧新增来源类型 `WEB` 与 `@AllowWeb()`，只有显式声明的路由接受网站来源；路由里的 `:steamId` 必须等于 token 的 uid，由 guard 统一拦。
- 不用 session cookie，也不加网站专用 API key。登录态在 Firebase SDK 手里，服务端看不见，所以门禁只能做在浏览器里。

## 3. 页面与菜单

### 页面清单

| 路径 | 页面 | 要登录 | 怎么进 |
|------|------|------|------|
| `/` | 首页 | 否 | 头部品牌名 |
| `/membership` | 会员介绍与订阅 | 否 | 头部菜单「会员订阅」 |
| `/profile/<steamId>` | 个人主页 | 是 | 头部的 ID 控件 |
| `/profile/<steamId>/property` | 属性加点 | 是 | 头部菜单「属性加点」（**未实现**，菜单项当前隐藏） |
| `/profile/<steamId>/awaken` | 英雄觉醒 | 是 | 头部菜单「英雄觉醒」（**未实现**，菜单项当前隐藏） |
| `/wiki/abilities`、`/wiki/items` | 技能与物品（开局抽选一览） | 否 | 头部菜单「技能与物品」（**未实现**，菜单项当前隐藏） |
| `/my/*` | 玩家页面的未登录入口，登录后跳 `/profile/<自己的 id>/*` | — | 菜单在未登录时指向这里 |
| `/regist/afdian`、`/regist/kofi` | 手动激活 | 否 | 从 `/membership` 进 |
| `/legal/disclosure` | 商业披露 | 否 | 页脚 |
| `/login/callback` | 登录回调 | — | 不进菜单 |

各页面的实现状态与对应批次见 [docs/design/web/README.md](../design/web/README.md) 的「分批计划」。

`/regist` 拼写是错的，但爱发电和 Ko-fi 的帖子里已经贴出去了，不改。

**页面没实现前，菜单项不放出来。** [config/nav.ts](../../web/config/nav.ts) 里 `href` 为 `null` 的项，头部横排和菜单都跳过渲染；对应页面上线时把 `href` 填上即可，不用再动 `Header.tsx`。不提前放空入口：玩家的主入口是游戏内的「前往网站」按钮直达功能页，菜单里出现一个点进去是空白的项，他会以为网站坏了。「未登录也显示属性、觉醒」说的是**登录态**——点进去看到登录面板，是有内容的，与页面尚未实现是两回事。

### 路径为什么带 steamId

玩家数据的页面一律是 `/profile/<steamId>/...`，学 Steam 社区的做法：

- **一套页面两用**。将来开放「看别人的资料」时，不用再造一份只读页面。
- **地址能分享**。复制给队友或贴进群里，对方打开的是同一页。
- **跟接口形状一致**。接口本来就是 `GET /player/:steamId/info`，路径参数一一对应，前端不用为「我自己」单开分支。

**现阶段只能自己看自己**：guard 拒绝一切非本人的请求，接口返回 403。开放观看是以后的事，那时要定哪些字段对外、开关放哪，都在后端。

为此现在要守一条规矩：**页面用 URL 里的 id 请求接口，不从登录态里取 uid**。今天这两个值必然相等，写哪个都能跑；写成 URL 里的 id，将来加观看模式只需要一个「是不是本人」的判断控制操作按钮，写成 uid 就要返工。

### `/my/*` 为什么存在

未登录时菜单里的「属性」「觉醒」拼不出 id，链接需要一个落点。`/my/property` 就是这个落点：未登录在这里显示登录面板，登录后跳到 `/profile/<自己的 id>/property`。它同时兜住直接访问和书签。

跳转只能在浏览器里做。Steam 的 `/my/*` 是服务端跳转，它有会话 cookie；我们的登录态在 Firebase SDK 手里，服务端看不见。所以从 `/my/` 进会多一次渲染。

### 菜单

- **结构与尺寸见 [phase-2g-header-layout.md](../design/web/phase-2g-header-layout.md)**：站内项横排在中间、站外项收到分割线之后，桌面与窄屏共用同一套汉堡菜单。
- **窄屏**：中间横排整体收起，语言与登录 / ID 常驻。
- **链接按登录态拼**：已登录指向 `/profile/<uid>/...`，未登录或登录态还在恢复时指向 `/my/...`。加载中用 `/my` 兜底——这一瞬间被点到也能正确落地，只是多一跳。
- **未登录也显示属性、觉醒**，点进去看到登录面板。多数玩家从游戏内「前往网站」直达功能页，这才是主入口，不能藏。
- 游戏内的「前往网站」按钮直接拼 `/profile/<id>/property`，不走 `/my/`，少一跳。
- 商业披露这类法务链接放页脚，不占头部。
- 面向玩家的文案按 [根目录 CLAUDE.md](../../CLAUDE.md) 的用语表。

### 个人主页放什么

| 区块 | 内容 |
|------|------|
| 身份卡 | ID、勇士等级、会员等级、可用勇士积分与会员积分 |
| 战绩 | 场次、胜率、行为分、点赞举报净值、生涯击杀死亡助攻等，照搬游戏内战绩页 |
| 会员状态 | 当前等级、到期日期，「去订阅」跳 `/membership` |
| 功能入口 | 属性、觉醒两张视觉占位卡；对应页面上线后再填入跳转链接 |

数据一次 `GET /player/:steamId/info?include=member,statsLifetime` 获取会员与战绩数据。

**属性和觉醒各占一个页面，不做成个人主页里的 tab**：游戏内它们本来就是独立面板，内容量也大（属性是一长串可加点条目，觉醒是英雄网格）；玩家多数从游戏内直达，独立 URL 才能深链。

## 4. 前端技术方向

| 项目 | 方向 | 状态 |
|------|------|------|
| 样式 | Tailwind 4 + CSS 变量定义设计 token | 已完成，取值见 [phase-7-visual-style.md](../design/web/phase-7-visual-style.md) |
| 组件 | 自建 Button、Input、Field、Spinner、Card 等一小套 | 已建，按需求继续加 |
| 字体 | Noto Sans SC | 已完成；不加载额外标题字体 |
| 数据层 | 倾向 TanStack Query，SWR 备选 | 实现属性页时定。核心交互是「看属性 → 加点 → 属性和积分一起刷新」，变更后失效缓存的模式正好对应 |
| 登录状态 | `AuthProvider` 包住 Firebase SDK 的 `onAuthStateChanged` | 已完成 |
| API 调用 | `apiFetch` 负责拼域名、带 token、转错误；每个资源一个 hook | `apiFetch` 已完成，hook 等属性页再建 |

### 渲染方式

| 页面 | 方式 | 原因 |
|------|------|------|
| 首页、商业披露、会员、激活页外壳 | 构建时静态生成 | 没有用户数据，最快，可被搜索 |
| 个人主页、属性、觉醒 | 静态外壳 + 浏览器登录后调 API | 要登录才能看，不需要 SEO |
| wiki 的技能、物品一览 | 构建时静态生成 | 公开、要被搜索，数据随版本更新时重新构建 |
| 排行榜（如果上网站） | ISR | 公开但会变，唯一适合 ISR 的场景 |

## 5. 已定决策

- 网站不直接访问数据库，所有操作走 API。
- 用户身份：Steam OpenID + Firebase Custom Token，API 验 ID Token，不加网站专用 key；Custom Token 由 NestJS 后端签发。
- 用户页面客户端渲染，不做 SSR；未登录的处理集中在 `/my/*` 一处，玩家页面自己不写登录判断。
- 属性、觉醒各自独立页面，网站不做游戏内那种 tab 弹窗。
- 玩家数据的页面路径带 steamId（`/profile/<steamId>/...`），公开资料页放 `/wiki/` 下。现阶段只能自己看自己，页面仍然按 URL 里的 id 取数据，为以后开放观看留路。
- 个人主页先只显示 ID。昵称和头像要 Steam Web API key，单独排一批，排在功能之后。
- 激活页在登录后自动填入 Dota2 ID（等于 uid），未登录仍可手填，激活接口保持 Public。
- 不做「记录」页：后端没有积分流水，只有当日限额计数；要做得新建集合并在每处积分变动加写入，价值不够。
- 会员购买排最后：本地主机已能购买，网站只是第二入口，订阅介绍页也已经有了。
