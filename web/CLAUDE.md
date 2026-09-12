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

## 校验

`cd web && npm run lint && npx tsc --noEmit && npm run build`

本目录没有测试框架，校验靠上面三条加下面的浏览器实测。

## 浏览器验证

改动会影响网站页面行为时，**最终验证必须在浏览器里实际操作页面**。`curl`、控制台 `fetch`、unit、e2e 都只是中间步骤，不能替代这一步。API 的 CORS、鉴权、响应格式改动同样适用——那些改动本来就是为网站做的。

- 工具：一律先用 Claude 桌面版内置浏览器（`mcp__Claude_Browser__*`），它已经带上 Chrome 的登录态；只有它做不到的场景才换 Chrome 扩展（`mcp__claude-in-chrome__*`）
- 打开外部站点（非 `localhost`）用 `preview_start` 并传 `url`，它会新开一个 tab；`navigate` 直接跳外部域名会返回 denied。进入站点后，同源内的跳转用 `navigate` 正常
- 内置浏览器的 network 面板可能不记录跨域 XHR。拿不到请求记录时，改用页面内 `javascript_tool` 发同样的请求读状态码与响应体，并确认 console 没有 CORS 报错
- 操作真实页面：点按钮、填表单、提交，再从 network 面板确认请求方法、状态码、响应体，并确认 console 没有报错
- 移动端用 `resize_window` 切到窄屏验证，不要只看桌面宽度
- 被验证的服务必须由**本分支**启动。端口被占用时先确认归属（可能是其他会话的旧代码），不要直接接着用，也不要直接 kill
- 把做了什么操作、看到什么请求与响应写进 PR 正文的测试清单
