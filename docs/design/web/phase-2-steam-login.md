# 批次 2：Steam 登录

> 状态：已完成。鉴权架构见 [docs/web/README.md](../../web/README.md) 第 2 节，登录入口的交互见 [phase-2-login-entry.md](phase-2-login-entry.md)。

玩家在网站上用 Steam 证明「我是这个 Dota2 账号的主人」，此后调 API 带上这个身份。分四次上线：后端先做换 token 的接口，再让 guard 认这个 token，网站接上登录跳转与门禁，最后是个人主页与激活页自动填 ID。

## 决定

- **跳转链接由前端拼**：OpenID 的请求参数是固定的，不需要后端参与，少一次往返
- **后端必须二次核对签名与回调域名**：回调参数从浏览器地址栏来，可以伪造；不核对域名，别人能拿我们的接口给自己的站签 token
- **Custom Token 由 NestJS 签**：后端已初始化 firebase-admin，逻辑集中、可写 e2e，网站不用引 admin SDK
- **归属校验放在 guard 统一拦**，不放各个 controller：这条规则一旦有一处漏写就是越权
- **归属校验不通过返回 403，token 无效才是 401**：网站靠这两个码区分「需要登录」和「这个人的资料看不了」
- **不用 session cookie，也不加网站专用 API key**：ID Token 由 Google 签名，已经能证明「本项目的登录用户」；cookie 是给服务端渲染准备的，而用户页面全部客户端渲染。代价是服务端看不见登录态，门禁只能做在浏览器里，Next 的 middleware 帮不上忙
- **e2e 用 Firebase Auth 模拟器验 ID Token**：签发与验签都走真实路径，只有 Steam 那次外部核对需要打桩

## 配置

运行时服务账号要有 `signBlob` 权限——`createCustomToken` 用它给 token 签名，默认没有，要给 `<项目编号>-compute@developer.gserviceaccount.com` 授予自身的 Service Account Token Creator 角色，否则线上登录报 `Permission 'iam.serviceAccounts.signBlob' denied`。

Firebase 控制台的 Authentication 服务本身要开，但 Custom Token 不需要启用任何提供商。

## 不做

- 昵称、头像等需要 Steam Web API key 的数据，单独排一批
- 排行榜、会员购买、账号绑定与解绑
