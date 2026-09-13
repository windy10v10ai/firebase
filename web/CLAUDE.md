# web/ 规约

Next.js 前端，部署在 Firebase App Hosting（windy10v10ai.com）。全仓库通用约定见根目录 [CLAUDE.md](../CLAUDE.md)。

## 本地开发

`cd web && npm run dev`

浏览器直连 API，域名由 `NEXT_PUBLIC_API_DOMAIN` 在构建期注入。三个环境变量文件按 Next 的固定语义分工：

| 文件 | Next 何时读取 | 进 git | 内容 |
|---|---|---|---|
| `.env` | 所有环境，优先级最低 | 是 | 兜底值，生产域名 `https://api.windy10v10ai.com` |
| `.env.development` | 仅 `next dev` | 是 | 本机 API `http://localhost:3001` |
| `.env.local` | 除 test 外所有环境，覆盖前两者 | 否 | 仅供个人临时覆盖（ngrok、拿本地页面打生产接口排查） |

本地开发不需要任何手工配置，`.env.development` 已经指向本机 API。

两条约束：

- **变量名必须带 `NEXT_PUBLIC_` 前缀**，否则不会注入客户端包，会静默回退到 `.env` 的生产域名——本地页面打的是生产接口，界面上看不出来。`config/constant.ts` 在 dev 下会把实际域名打到控制台，启动后扫一眼
- **`.env.local` 不能进 git**。它在 `next build` 时同样生效，一旦提交，App Hosting 的生产构建会被本地值覆盖。需要共享的本地配置写进 `.env.development`

网站不放密钥：浏览器拿得到的值按定义都是公开的（Firebase Web SDK 配置、GA4 measurement ID 皆然）。真需要服务端密钥时走 App Hosting 的 secret 绑定，不进文件。

## API 鉴权

网站登录后请求带 `Authorization: Bearer <Firebase ID Token>`，uid 就是 Dota2 32 位账号 ID。**新调一个之前网站没用过的接口，要先确认 API 侧挂了 `@AllowWeb()`**，否则一律 401；这条挂在 [api/CLAUDE.md](../api/CLAUDE.md) 常见坑里。路由参数 `:steamId` 与 uid 不一致会被 guard 拒绝，网站不用自己做归属校验。架构见 [docs/design/web/README.md](../docs/design/web/README.md) 第 3 节。

## 校验

`cd web && npm run lint && npx tsc --noEmit && npm run build`

本目录没有测试框架，校验靠上面三条加下面的浏览器实测。

## 浏览器验证

改动会影响网站页面行为时，**最终验证必须在浏览器里实际操作页面**。`curl`、控制台 `fetch`、unit、e2e 都只是中间步骤，不能替代这一步。API 的 CORS、鉴权、响应格式改动同样适用——那些改动本来就是为网站做的。

- 工具：用 Playwright 驱动无头 Chrome，做法见 [.claude/skills/web-browser-verify/SKILL.md](../.claude/skills/web-browser-verify/SKILL.md)，不依赖运行环境是否为 Claude Desktop。仅当当前会话确实运行在 Claude Desktop 里、且要测的场景需要真实登录态时，可改用内置浏览器（`mcp__Claude_Browser__*`）省一步登录；`mcp__claude-in-chrome__*` 留作前两者都不可用时的兜底
- 使用 Claude 桌面版内置浏览器时：打开外部站点（非 `localhost`）用 `preview_start` 并传 `url`，它会新开一个 tab；`navigate` 直接跳外部域名会返回 denied。进入站点后，同源内的跳转用 `navigate` 正常
- 使用 Claude 桌面版内置浏览器时：它的 network 面板可能不记录跨域 XHR。拿不到请求记录时，改用页面内 `javascript_tool` 发同样的请求读状态码与响应体，并确认 console 没有 CORS 报错（Playwright 路径用 `page.on('response')` 直接拿跨域响应，不受此限制）
- 操作真实页面：点按钮、填表单、提交，再从 network 面板确认请求方法、状态码、响应体，并确认 console 没有报错
- 布局有改动时按下一节的三档宽度逐页验证，不要只看桌面宽度
- 被验证的服务必须由**本分支**启动。端口被占用时先确认归属（可能是其他会话的旧代码），不要直接接着用，也不要直接 kill
- 把做了什么操作、看到什么请求与响应写进 PR 正文的测试清单

## 验证宽度

页面布局有改动时，按这三档逐页验证：

| 宽度 | 代表 | 重点看 |
|---|---|---|
| 375 | 手机主流机型 | 头部元素是否接触或折行；表单能否完整填写并提交 |
| 768 | 平板竖屏，也是头部由汉堡切回横排后最挤的一档 | 横排头部放不放得下；表单 label 与输入框的分栏有没有被挤压 |
| 1280 | PC | 内容区居中与留白是否正常；与改动前是否一致 |

每档确认三件事：无横向滚动、无元素超出视口、头部元素互不接触。用 `resize_window` 切宽度，用 `javascript_tool` 量 `document.documentElement.scrollWidth > innerWidth` 与元素的 `getBoundingClientRect()`，不要只靠肉眼看截图。

**更宽的分辨率不用单独跑。** `container` 在 1536 封顶，1280 以上只增加两侧留白，不会让任何元素被迫收缩，布局风险随宽度单调下降。

## PR 截图

改了页面外观，PR 正文里要放前后对比图。

**只要 PR 碰到页面，就放图，不管前后有没有差异。** 不要用测量数据代替截图——哈希、坐标、计算色都是写 PR 的人自己算的，review 的人既无法复核，也看不出页面长什么样。截图是他们唯一能用眼睛直接判断的证据。测量数据是补充，不是替代。

「这个 PR 本来就不打算改外观」尤其不是免拍的理由：升级依赖、换构建器、改公共组件都可能带出非预期的差异，那种情况最需要留图。

**拍哪些**：每个被这个 PR 碰到的页面，各至少一档窄屏（320 或 375）和一档桌面宽度（1280）。

**前后没有差异时**：无头 Chrome 用同一组参数拍出来的图，页面没变就是逐字节相同的 PNG。`md5 -q` 比一下，相同就只贴一份图，把 md5 写进正文说明另一份一样——这比自算的哈希更有说服力，因为读者可以自己重拍一张对。

### 截图

**用无头 Chrome，页面用生产构建起**（`npm run build && npm start`）——dev server 左下角的开发指示器会入镜：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=old --disable-gpu --hide-scrollbars --virtual-time-budget=5000 \
  --window-size=320,700 --screenshot=out.png http://localhost:3000/regist/afdian
```

三个参数缺一不可：

- `--headless=old`：`--headless=new` 不按 `--window-size` 设布局视口，出来的图右侧内容被切掉
- `--virtual-time-budget=5000`：激活表单在 React 副作用跑完前渲染的是 `null`，截早了拍到空白页
- `--hide-scrollbars`：否则窄屏图里多一条滚动条

前后两张须使用同一组 `--window-size`，并且同一条命令、同一个 Chrome profile——无头 Chrome 的 `Accept-Language` 与浏览器里的不同，会拍出另一种语言的页面，只要前后一致就不影响对比。

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

前后对比用两列表格并排放置。图片用 `<img src="..." width="320">` 控制宽度，`![]()` 语法无法限制尺寸。
