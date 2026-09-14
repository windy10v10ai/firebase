---
name: debug-evidence
description: 排查本仓库的 bug 时加载——线上偶发故障、本地跑不通、登录链路异常。包含 Cloud Logging 生产日志的查询方式与日志字段形状、把两类日志对齐判读的方法、本地走真实 Steam 登录复现的做法，以及判断故障落在浏览器侧还是 API 侧的判据。
---

# 排查证据从哪来

`superpowers:systematic-debugging` 管的是「先定根因再改」的流程，这份文档管的是**本仓库的证据存放在哪、长什么样、怎么判读**。两者一起用：那边说要收集证据，这里说去哪收集。

页面行为本身的验证走 [web-browser-verify](../web-browser-verify/SKILL.md)，它注入 token 跳过登录；本文第三节相反，走真实 Steam 链路，用于验证登录链路自身。

## 先查生产日志

线上偶发故障优先查日志，不要先猜。本机的 `gcloud` 已认证 `windybirth@gmail.com`，默认项目 `windy10v10ai`，直接查即可。**只读日志，不要用 gcloud 改线上任何资源。**

两类日志分开存，必须都查：

**后端自己写的结构化日志**，来自 `firebase-functions/v2` 的 `logger`：

```bash
gcloud logging read 'jsonPayload.message=~"关键字"' --project windy10v10ai --freshness=7d --limit=50 \
  --format='value(timestamp,jsonPayload.message,jsonPayload.reason,jsonPayload.steamId)'
```

字段形状：`jsonPayload.message` 是 `logger` 的第一个参数，第二个参数的各个键平铺在 `jsonPayload` 下（如 `reason`、`steamId`），`severity` 取 `INFO` / `WARNING` / `ERROR`。

**HTTP 请求日志**，每个请求一条，后端没打日志的路径也有：

```bash
gcloud logging read 'httpRequest.requestUrl=~"路由片段"' --project windy10v10ai --freshness=7d --limit=50 \
  --format='value(timestamp,httpRequest.status,httpRequest.latency,httpRequest.userAgent)'
```

状态码含义：`204` 是 CORS 预检（缓存一天，所以一串请求里通常只有第一条有）、`2xx` 是业务成功、`4xx` 是后端主动拒绝。

`severity>=ERROR` 单独查一遍，能捞到未被捕获的异常。

### 判读：把两类日志按时间对齐

单看任何一类都会漏掉真相，`userAgent` 可以把同一个人的连续动作串起来。两种形状要认出来：

- **同一个 UA 在几分钟内反复成功**——不是用户勤快，是页面在后端成功之后仍然报错，用户一直重试。故障点在后端返回之后的客户端代码里
- **成功之间夹着 4xx**——用户在失败页刷新，重新提交了同一份参数

## 判断故障落在哪一层

页面上的错误码是第一手线索（见最后一节）。拿不到错误码时，靠「后端有没有留下记录」区分：

| 后端结构化日志 | HTTP 请求日志 | 结论 |
|---|---|---|
| 成功 | 2xx | 故障在后端返回之后的浏览器代码里，如向 Google 换登录态、写本地存储 |
| 主动拒绝 | 4xx | 故障在后端的校验逻辑，`reason` 字段直接指出是哪一步 |
| 无 | 无 | 请求没到后端：浏览器到 API 的网络、CORS、域名解析 |
| 无 | 5xx | 后端抛了未捕获异常，查 `severity>=ERROR` |

换登录态与刷新 token 要连 Google，这两条请求经本站域名转发出去（见 [docs/web/README.md](../../../docs/web/README.md) 的鉴权一节）。第一行那种形状优先怀疑这条转发链路。

## 本地复现真实 Steam 登录链路

根目录 `npm run start` 起全套，端口见根目录 [CLAUDE.md](../../../CLAUDE.md) 的「本地开发」。开跑前确认三个都活着：

```bash
curl -s -o /dev/null -w "web:%{http_code} " http://localhost:3000; \
curl -s -o /dev/null -w "api:%{http_code} " http://localhost:3001/api-doc; \
curl -s -o /dev/null -w "auth:%{http_code}\n" http://127.0.0.1:9099
```

后端日志直接看 `npm run start` 的输出，结构化日志在本地也是一行 JSON。

会话跑在 Claude Desktop 里时，用内置浏览器走完整链路：打开 `http://localhost:3000`，点 Sign in with Steam，Steam 的授权确认页**每次都会出现**（即使 Steam 已登录），页面上的授权按钮是 `#imageLogin`，用 `document.querySelector('#imageLogin').click()` 点。回到站内后头部的 Sign out 退出，再进下一轮。

按 ref 点 Steam 页面的元素不可靠：ref 表在跳转后失效，批量操作里要先 `read_page` 重建。用 `#imageLogin` 直接点更稳。

三条本地已验证的事实，排查时可以直接当前提：

- **同一份 openid 回调参数验证第二次必然失败**，Steam 返回签名无效。失败页刷新就会产生这条记录，它是重试的结果而不是首次失败的原因
- **正常流程本身是稳的**。连续十轮登录/退出全部成功，偶发故障不在这条路径上
- **模拟「浏览器够不到 Firebase」**：把 [web/config/firebase.ts](../../../web/config/firebase.ts) 里 `connectAuthEmulator` 的端口改成一个没人监听的端口，登录后就会复现「后端成功、页面报失败」的画面，浏览器 console 只有一行 `ERR_CONNECTION_REFUSED`。验完改回去

## 客户端的失败先问错误码

登录回调失败时页面会显示一行错误码，`api/<状态码>` 表示接口拒绝，其余是 Firebase 自己的错误码（如 `auth/network-request-failed`），console 里有完整错误对象。**让用户把这一行截图发来，比查任何日志都快。**

后端只在自己主动拒绝时写 `WARNING`，客户端那一侧发生的事它不知道，所以错误码是判断客户端故障的唯一入口。拿不到错误码时才退回上一节的表格。
