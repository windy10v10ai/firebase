# web/ 规约

Next.js 前端，部署在 Firebase App Hosting（windy10v10ai.com）。全仓库通用约定见根目录 [CLAUDE.md](../CLAUDE.md)。

## 本地开发

`cd web && npm run dev`

浏览器用相对路径调 API，由 `next.config.ts` 的 rewrite 转发到 `API_ORIGIN`。三个环境变量文件按 Next 的固定语义分工：

| 文件 | Next 何时读取 | 进 git | 内容 |
|---|---|---|---|
| `.env` | 所有环境，优先级最低 | 是 | 兜底值，生产函数地址 `https://asia-northeast1-windy10v10ai.cloudfunctions.net/client` |
| `.env.development` | 仅 `next dev` | 是 | 本机 API `http://localhost:3001` |
| `.env.local` | 除 test 外所有环境，覆盖前两者 | 否 | 仅供个人临时覆盖（ngrok、拿本地页面打生产接口排查） |

本地开发不需要任何手工配置，`.env.development` 已经指向本机 API。

四条约束：

- **`API_ORIGIN` 不带 `NEXT_PUBLIC_` 前缀**：它只是转发目的地，页面代码不该拿到 API 域名。要进客户端包的变量（`NEXT_PUBLIC_FIREBASE_*`）仍必须带前缀，否则静默为 undefined
- **`.env.local` 不能进 git**。它在 `next build` 时同样生效，一旦提交，App Hosting 的生产构建会被本地值覆盖。需要共享的本地配置写进 `.env.development`
- **初始化 Firebase SDK 只用 `NEXT_PUBLIC_FIREBASE_*`，不要用 App Hosting 注入的 `FIREBASE_WEBAPP_CONFIG`**。那份配置由 Firebase 服务端生成，字段跟着项目资源走，含有本站用不到也无法控制的值（如已废弃的 `databaseURL`），本地也拿不到同一份
- **`next.config.ts` 的 `/api` 转发不是开发便利设施**：游戏客户端与支付宝回调也走它，删掉会断掉收款。入口清单见 [docs/api/README.md](../docs/api/README.md) 的「对外入口」

网站不放密钥：浏览器拿得到的值按定义都是公开的（Firebase Web SDK 配置、GA4 measurement ID 皆然）。真需要服务端密钥时走 App Hosting 的 secret 绑定，不进文件。

## API 鉴权

网站登录后请求带 `Authorization: Bearer <Firebase ID Token>`，uid 就是 Dota2 32 位账号 ID。**新调一个之前网站没用过的接口，要先确认 API 侧挂了 `@AllowWeb()`**，否则一律 401；这条挂在 [api/CLAUDE.md](../api/CLAUDE.md) 常见坑里。路由参数 `:steamId` 与 uid 不一致会被 guard 拒绝，网站不用自己做归属校验。架构见 [docs/web/README.md](../docs/web/README.md) 第 2 节。

## 统计

理由见 [docs/web/README.md](../docs/web/README.md) 第 5 节「统计」。

- **事件发在哪端，看浏览器在不在场**：页面浏览、登录成功这类浏览器行为用 `app/lib/analytics.ts` 的 `trackEvent`；加点、洗点、觉醒、签到这些改数据的动作由 API 在服务端发，网站不再发一次，否则同一件事记两遍
- **不用 `firebase/analytics`（`getAnalytics`、`logEvent`）**：它初始化时要多取一次远端配置，等于多一个可能到不了的域名；我们只需要 gtag 发事件这一件事
- **登录态变化时设 user_id**，只在 `AuthProvider` 那一处维护，退出时传 `null`
- **测量 ID 读 `NEXT_PUBLIC_GA_MEASUREMENT_ID`**，留空即不加载 gtag。它是公开值，按上面「本地开发」的规约可以进 git

## 文案里的开局方式

理由见 [docs/web/README.md](../docs/web/README.md) 的「开局方式与命名」，取值见[根目录 CLAUDE.md](../CLAUDE.md) 的「用语」。

- **动作名只用「从游廊开局」「从网站启动游戏」**，不拿连接状态当动作名，不写「用在线模式开局」
- **「离线」「在线」只说连接状态**，用在解释数据新旧与 `/launch` 的对比表里；「本地主机」「服务器主机」只说主机，不指代连接状态
- **入口不上状态词**：页脚、首页卡、提示条说怎么开局、什么时候在游戏内生效，哪种方式是离线只在 `/launch` 解释
- **说生效时机必须带上开局方式**：从游廊开局等下次地图更新，从网站启动游戏下一局生效、游戏内刷新当场生效。不写不分方式的「立即生效」「回游戏点刷新」，也不写「打一局就有数据」
- **完整规则只写在 `/launch`**，别的页面挂 `OfflineNotice` 或一条指向它的链接，不重写一遍
- **控制台命令只出现在 `/launch` 最后一节**，不当主路径写，并写明它和启动链接是同一件事

## 加载态

页面一出现就是最终结构，之后只有数值在变；首屏打开与站内跳转都适用。为什么这样定见 [docs/web/README.md](../docs/web/README.md) 第 4 节「加载态」与 [phase-10-first-paint.md](../docs/design/web/phase-10-first-paint.md)。

- **登录形态直接读 `useAuth()`，不写加载中分支。** `AuthState` 只有 `authenticated` / `unauthenticated` 两态，首屏初值来自根 layout 读到的 `player-uid` cookie。这个 cookie 只在 `AuthProvider` 的 `onAuthStateChanged` 里写和删；它不是凭据，不得用于鉴权、跳转或归属判断
- **请求不等登录态。** `apiFetch` 取 token 前已经 `await auth.authStateReady()`，页面不写「登录态恢复后再发请求」的判断
- **加载中渲染真实布局，必有值的位置放骨架块。** 用 `app/components/ui/skeleton.tsx`，放在字段原位（`{value ?? <Skeleton />}`）。不写替换整页的占位组件：那是第二套布局，要手工与真实页面保持同尺寸，改一处就会跳
- **可能本来就为空的位置不放骨架，只占位。** 如非会员的会员行：容器用 `min-h-*` 按行高留出空间，数据到了原地填入。骨架块预告「这里马上有内容」，内容可能不存在时会误导
- **尺寸由容器定，不由内容定。** 高度可能随文案长度变化的行加 `truncate` 不折行，父级 flex 项加 `min-w-0`；图片放进固定尺寸的容器，没到或加载失败时显示兜底图标
- **失败态可以整块替换。** 401 换成登录面板、403 / 404 换成说明，这是用户预期内的切换
- **不加路由级 `loading.tsx`。** 它在跳转时显示整页 fallback，等于第二套布局

改动涉及加载过程时，浏览器验证要量 CLS：Playwright 里用 `PerformanceObserver` 收 `layout-shift`，首屏到数据加载完应接近 0；再用禁用 JS 的 context 打开，确认首帧 HTML 已经是最终结构。

## 多语言

理由见 [docs/web/README.md](../docs/web/README.md) 第 4 节「多语言」。

- **网站标准支持中文、英文、俄语三种语言**：新增或改动界面文案时，`messages/zh.json`、`en.json`、`ru.json` 在同一个 PR 里一起改，三份的 key 保持一致。回落英文只用于接入一种新语言的过渡期，不是日常新增文案少写一种语言的理由
- **语言清单只写在 `i18n/locales.ts`**：代码、单字标记、母语名在同一处，新增语言改这一个数组，探测、cookie 校验、切换列表跟着变
- **新语言可以只译一部分**，`messages/<locale>.json` 缺的 key 由 `i18n/messages.ts` 合并英文补上；**`messages/en.json` 必须齐全**，它是兜底的那一份，缺 key 就没有东西可回落
- **组件里取语言用 `useLocale()`，cookie 名用 `LOCALE_COOKIE`**，不写字面量
- **语言控件不得超过 44px 宽**，上限的来历见 [phase-2g-header-layout.md](../docs/design/web/phase-2g-header-layout.md)
- **横排导航加项前先确认放得下**：768 最多四项，让位的项在 `config/nav.ts` 标 `desktopOnly`；新增语言要量 1024 已登录这一档，放不下六项就在 `i18n/locales.ts` 给它标 `compactNav`
- **俄文译法先查 game 仓库的 `game/resource/addon_russian.txt`**，游戏里已有的说法照搬；游戏俄文里保持英文的专有名词（Battle Points、Member Points、Battle Level、Member Level）网站也不译
- **俄文里带数量的句子用 ICU plural 写全 `one` / `few` / `many` / `other`**，英文原文没有 plural 也一样；传入的参数必须是数字，不能是 `toLocaleString()` 之后的字符串
- **浏览器验证与 PR 截图三种语言都过**，不只是改了文案才过：缺 key 不会让页面崩，只在 console 的 `MISSING_MESSAGE` 里看得到；俄语文案最长，布局改动最容易在俄语上撑破

## 断点

只用 `md:`（768）与 `lg:`（1024），不写 `sm:`、`xl:`、`2xl:`。三档各呈现什么、为什么这样分见 [docs/web/README.md](../docs/web/README.md) 第 4 节「屏幕档位」。

| 档位 | 宽度 | 前缀 |
|---|---|---|
| 手机 | < 768 | 无前缀 |
| 平板 | 768–1023 | `md:` |
| 电脑 | ≥ 1024 | `lg:` |

- **靠鼠标才成立的写 `lg:`，不写 `md:`。** 较矮的按钮（`min-h-11 lg:min-h-10`）、常驻的次要按钮、完整的账号文字都是这类；平板和手机一样按触控处理
- **成排的条目卡网格写 `md:grid-cols-2 lg:grid-cols-3`。** 只有两项的卡组（如会员平台卡）到 `md:grid-cols-2` 为止
- **容器查询（`@container` 配 `@sm:` 等）不受此限。** 它按所在卡片的宽度分栏，与屏幕档位无关

## 内边距

页面外壳、卡片、嵌入块三层留白在窄屏会叠加，各写各的会把 375 的正文挤掉近三成，所以按宽度收放，统一收在 `globals.css` 的三个类里。

| 类 | 用在 |
|---|---|
| `.card-pad` | 整块区域卡：身份卡、等级卡、战绩卡、会员卡、`Section`、`Notice`、激活表单 |
| `.card-pad-sm` | 网格里成排出现的条目卡：属性卡、首页与个人主页的入口卡，以及同尺寸的提示条 |
| `.box-pad` | 卡片内部的嵌入块：属性点卡的数据框、战绩卡的概览框 |

- **调用点不写 `p-*` / `px-*` / `py-*`**，挂上面的类；要调尺度改类，全站跟着变
- 某一边要单独让位时仍挂对应的类，只用方向 utility 覆盖那一边——utility 层排在 components 层之后，覆盖总会生效
- `<dialog>` 这类自带默认内边距的元素，外层 `p-0` 清掉，内层再挂类
- 页面外壳是 `px-3 md:px-4`，不属于这三类

## 可点击元素

理由见 [docs/web/design-system.md](../docs/web/design-system.md)「可点击元素」。

- **能点的一律手型，靠 `globals.css` base 层的全局规则**，调用点不写 `cursor-pointer`。可点击的控件用 `<button>` 或 `<a>` / `Link`，不用 `<div onClick>`
- **整张卡或整行是链接时，右侧放 `ChevronRight`（`text-muted`），悬停要有看得见的变化**；不能点的不放箭头
- **悬停描边随归属**：属于勇士的入口用 `hover:border-season-border`，属于会员的用 `hover:border-member-border`，其余用 `.card-hover`
- **整行链接里子元素各自写了文字颜色时，外层的 `link-hover` 看不出变化**。这种链接改用 `group`，在子元素上写 `group-hover:`

## 颜色

分工、取值与理由见 [docs/web/design-system.md](../docs/web/design-system.md)。

- **调用点不写色值**，一律用 `globals.css` `@theme` 里的 token；要新颜色先加 token
- **紫（`season`）与金（`member`）只表示勇士与会员两套货币**，不用于交互反馈或通用按钮
- **交互反馈用主色标记档 `link` 系列**：链接、当前页标记、焦点框、转圈、`.card-hover` 都是它
- **功能色只上图标与图标底块**：`text-feature-*` 与 `bg-feature-*-soft`。首页卡片、头部菜单、个人主页入口卡三处用同一个。新功能上线按 design-system.md「功能色」的扩展顺序取色，先加 token
- **品牌色只上平台自己的标识**（平台名、图标、平台自己的页面标题，如激活页），不上按钮、描边、悬停。新增品牌加 token，并在 design-system.md「品牌色」登记它和站内哪个颜色同色系
- **折扣标签用 `discount`，不用 `danger`**，形状与限免标签一致，见 design-system.md「状态色」

## 按钮

按钮颜色回答「点了花什么」，不回答「这一页讲什么」。规格与理由见 [docs/web/design-system.md](../docs/web/design-system.md)「按钮」：

| 操作 | 写法 |
|---|---|
| 花勇士积分，或与游戏里是同一个操作（加点、觉醒） | `.btn-season`，暂存一步用 `.btn-season-outline` |
| 花会员积分 | `.btn-member` |
| 提交、重试、跳转、去外部平台订阅或付款 | `.btn-primary`，即 `Button` 的默认 `variant` |
| 取消、次要操作 | `.btn-secondary` |
| 与主按钮并排的返回、跳过 | `.btn-ghost` |
| 清空、重置这类撤不回的入口 | `.btn-danger` |
| 登录类的第三方入口 | 次按钮外观加品牌图标，Steam 用 `STEAM_BUTTON_CLASS` |

- **每屏最多一个主按钮**
- **请求进行中用 `Button` 的 `loading`**：按钮内转圈并禁用，文案由调用方换成进行时。不盖整页遮罩
- **游戏按钮（`.btn-season`、`.btn-member`）的取值照搬游戏仓库的 `buttons.less`，不改**，属性、觉醒页要与游戏内同名操作长得一样

## 校验

`cd web && npm run lint && npx tsc --noEmit && npm run build`

本目录没有测试框架，校验靠上面三条加下面的浏览器实测。

## 浏览器验证

改动会影响网站页面行为时，**最终验证必须在浏览器里实际操作页面**。`curl`、控制台 `fetch`、unit、e2e 都只是中间步骤，不能替代这一步。API 的 CORS、鉴权、响应格式改动同样适用——那些改动本来就是为网站做的。

- 工具：用 Playwright 驱动无头 Chrome，做法见 [.claude/skills/web-browser-verify/SKILL.md](../.claude/skills/web-browser-verify/SKILL.md)，不依赖运行环境是否为 Claude Desktop。仅当当前会话确实运行在 Claude Desktop 里、且要测的场景需要真实登录态时，可改用内置浏览器（`mcp__Claude_Browser__*`）省一步登录；`mcp__claude-in-chrome__*` 留作前两者都不可用时的兜底
- 使用 Claude 桌面版内置浏览器时：打开外部站点（非 `localhost`）用 `preview_start` 并传 `url`，它会新开一个 tab；`navigate` 直接跳外部域名会返回 denied。进入站点后，同源内的跳转用 `navigate` 正常
- 使用 Claude 桌面版内置浏览器时：它的 network 面板可能不记录跨域 XHR。拿不到请求记录时，改用页面内 `javascript_tool` 发同样的请求读状态码与响应体，并确认 console 没有 CORS 报错（Playwright 路径用 `page.on('response')` 直接拿跨域响应，不受此限制）
- 操作真实页面：点按钮、填表单、提交，再从 network 面板确认请求方法、状态码、响应体，并确认 console 没有报错
- 布局有改动时按下一节的四档宽度逐页验证，不要只看桌面宽度
- 被验证的服务必须由**本分支**启动。端口被占用时先确认归属（可能是其他会话的旧代码），不要直接接着用，也不要直接 kill
- 把做了什么操作、看到什么请求与响应写进 PR 正文的测试清单

## 验证宽度

页面布局有改动时，按这四档逐页验证。375、768、1024 分别是「断点」一节里三档的最窄处，布局最挤：

| 宽度 | 代表 | 重点看 |
|---|---|---|
| 375 | 手机主流机型 | 头部元素是否接触或折行；表单能否完整填写并提交 |
| 768 | 平板竖屏，也是头部由汉堡切回横排后最挤的一档 | 横排头部放不放得下；两列卡片与表单分栏有没有被挤压 |
| 1024 | 电脑档起点，`lg:` 刚生效 | 三列卡片里的按钮文字是否溢出；头部 ID 文字与横排导航放不放得下，俄语已登录最挤 |
| 1280 | PC | 内容区居中与留白是否正常；与改动前是否一致 |

每档中、英、俄三种语言都过，确认三件事：无横向滚动、无元素超出视口、头部元素互不接触。俄语文案最长，中英文放得下的按钮、卡片标题、横排导航，俄语可能撑破。用 `resize_window` 切宽度，用 `javascript_tool` 量 `document.documentElement.scrollWidth > innerWidth` 与元素的 `getBoundingClientRect()`，不要只靠肉眼看截图。

**更宽的分辨率不用单独跑。** 外框在 1280 封顶（`max-w-7xl`），1280 以上只增加两侧留白，不会让任何元素被迫收缩，布局风险随宽度单调下降。

## PR 截图

改了页面外观，PR 正文里要放前后对比图。

**只要 PR 碰到页面，就放图，不管前后有没有差异。** 不要用测量数据代替截图——哈希、坐标、计算色都是写 PR 的人自己算的，review 的人既无法复核，也看不出页面长什么样。截图是他们唯一能用眼睛直接判断的证据。测量数据是补充，不是替代。

「这个 PR 本来就不打算改外观」尤其不是免拍的理由：升级依赖、换构建器、改公共组件都可能带出非预期的差异，那种情况最需要留图。

**拍哪些**：每个被这个 PR 碰到的页面，375 与 1280 两档 × 中、英、俄三种语言。一种语言有文案、另一种缺 key 的情况从截图上看不出来，几组图摆在一起才拦得住；俄语最长，布局问题多半先出在它身上。

**前后没有差异时**：无头 Chrome 用同一组参数拍出来的图，页面没变就是逐字节相同的 PNG。`md5 -q` 比一下，相同就只贴一份图，把 md5 写进正文说明另一份一样——这比自算的哈希更有说服力，因为读者可以自己重拍一张对。

### 截图

**用无头 Chrome，页面用生产构建起**（`npm run build && npm start`）——dev server 左下角的开发指示器会入镜：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=old --disable-gpu --hide-scrollbars --virtual-time-budget=5000 \
  --window-size=375,700 --screenshot=out.png http://localhost:3000/regist/afdian
```

三个参数缺一不可：

- `--headless=old`：`--headless=new` 不按 `--window-size` 设布局视口，出来的图右侧内容被切掉
- `--virtual-time-budget=5000`：激活表单在 React 副作用跑完前渲染的是 `null`，截早了拍到空白页
- `--hide-scrollbars`：否则窄屏图里多一条滚动条

三种语言分三次拍，加 `--accept-lang=zh-CN` / `en-US` / `ru-RU` 指定；不加时无头 Chrome 的 `Accept-Language` 与浏览器里的不同，会拍出另一种语言的页面。前后两张须使用同一组 `--window-size` 与 `--accept-lang`，同一条命令、同一个 Chrome profile。用 Playwright 拍时按 [web-browser-verify](../.claude/skills/web-browser-verify/SKILL.md) 第 8 步写 `NEXT_LOCALE` cookie。

### 「改动前」怎么来

**基线是本 PR 的 base 分支，通常是 `develop`，不是线上。** 线上 `windy10v10ai.com` 跑的是 `main`，只有当 `develop` 与 `main` 确实没有页面差异时才能直接拍线上省事。拿不准就本地起基线，不要默认拍线上。

本地起基线不用切分支，把 base 分支的 `web/` 解到临时目录单独构建，与本分支的服务同时跑在两个端口：

```bash
git archive develop web | tar x -C <临时目录>
cd <临时目录>/web && npm ci && npm run build && npx next start -p 3100
```

正文里要注明基线是哪个分支、怎么起的。

### 图片存放

**放 `assets` 孤儿分支**，不进 `develop` 的源码树。路径里要有 PR 编号，所以顺序是**先建 PR 拿到编号，再补图，再 `gh pr edit` 更新正文**：

```bash
git worktree add --detach <临时目录>/wt-assets origin/assets
cd <临时目录>/wt-assets && git checkout -B assets origin/assets
mkdir -p pr/<PR 编号> && cp <图片> pr/<PR 编号>/
git add -A && git commit -m "Add screenshots for PR #<PR 编号>" && git push origin assets
```

用完 `git worktree remove <临时目录>/wt-assets --force` 清掉。

正文按 raw 链接引用，仓库是公开的，Markdown 可直接渲染：

```
https://raw.githubusercontent.com/windy10v10ai/firebase/assets/pr/<PR 编号>/<名字>.png
```

推完先 `curl -o /dev/null -w '%{http_code}'` 逐个确认返回 200 再写进正文，链接拼错在 PR 里只会显示成裂图。

**重拍的图要换一条路径，不要覆盖旧文件**（`pr/<PR 编号>/v2/` 之类）。GitHub 的图片代理按 URL 缓存，同一条链接推了新内容，PR 里仍然显示旧图，看起来像没改。

前后对比按宽度分两种排法：

- **窄屏（375）两列并排**，`<img width="320">`。窄图并排刚好，一眼能比
- **桌面宽度（1280）上下排列**，各占一行，`<img width="760">` 或更宽。并排后每张只剩 460px，桌面版的间距、字号、对齐全看不清，比不出所以然

图片用 `<img src="..." width="...">` 控制宽度，`![]()` 语法无法限制尺寸。

**拍图这一步可以派给子代理**，前提与指令写法见 [web-browser-verify](../.claude/skills/web-browser-verify/SKILL.md) 的「把 PR 截图交给子代理」。验收仍归主会话。