---
name: launcher-release
description: 发布启动器新版本时加载——「发版启动器」「launcher 发 0.x.x」「更新 /launch 的下载」。包含发版前的 Defender 与 VirusTotal 扫描、误报申报、dev 站下载验证的操作细节，以及官网 /launch 更新日志的写法。
---

# 发布启动器

按 [launcher/README.md](../../../launcher/README.md)「发布」五步走，流程与理由以那里为准。下面只补每步的操作细节。

## 第 3 步：扫描

本机 Defender 扫描用 `& "$env:ProgramFiles\Windows Defender\MpCmdRun.exe" -Scan -ScanType 3 -File <exe> -DisableRemediation`，输出 `found no threats` 即通过。

VirusTotal 用 Claude in Chrome 自动上传，不用 API（要填密钥）：

- 上传框藏在 `vt-ui-main-upload-form` 的 shadow DOM 里，`find` / `file_upload` 拿不到 ref。先用 `javascript_tool` 往 `document.body` 插一个带 `aria-label` 的 `<input type="file">`，`file_upload` 传给它，再用 `DataTransfer` 把文件赋给 shadow DOM 里的第二个 file input 并派发 `change`，页面会弹出「Confirm upload」，同样在 shadow DOM 里找到这个按钮调 `click()` 即开始扫描
- 应用内置浏览器（`mcp__Claude_Browser__*`）没有 `file_upload`，本机文件进不了页面，只能请用户手动选文件
- 扫描完成后页面跳到 `/gui/file/<sha256>`，单次 `javascript_tool` 超过 45 秒会超时，等跳转要分几次轮询；结果在 shadow DOM 里，`get_page_text` 读不到，用 `javascript_tool` 递归拼 `shadowRoot` 的文本，取检出数与 Microsoft 一栏

Microsoft 一栏报 `!ml` 时，用 Claude in Chrome 代为申报误报，用户的 Chrome 已登录微软账号：

- 申报页选「Software developer」，产品选「Microsoft Defender Antivirus (Windows 11)」，Company Name 填 `Windy10v10AI`，「What do you believe this file is?」选「Incorrectly detected as malware/malicious」，Detection name 填 VirusTotal 上的检出名，Additional information 用英文写清这是本仓库的开源启动器、源码与下载地址、由 GitHub Actions 编译、本机 Defender 不报
- 上传框是普通的 file input，`find` 拿到 ref 后直接 `file_upload`；文件要先复制到会话临时目录
- 最后一页「Review your submission」有验证码，Claude 不能代填：滚到验证码处，请用户填验证码并点 Submit

## 第 4 步：更新日志

条目写在 `web/app/launch/changelog.ts` 与三语 `launch.changelog.entries`，玩家在官网 `/launch` 下载前读。

- 每版 1–3 条，每条一句，只写玩家能感觉到的变化。没有玩家可感知改动的条目整条删掉，全版只剩小修就写「修复了一些问题」
- **只写结果，不写怎么做到的、带来什么好处**。用户改稿的典型删法：
  - 「直连不上时自动改走中转服务器，和朋友联机更容易成功」→「优化联机方式，解决部分玩家无法连接的问题」
  - 「掉线后可在启动器「重新进入游戏」，减少溢出错误，主机运行更流畅」→ 删掉「主机运行更流畅」
  - 「「加入联机」页能看到正在进行的游戏和房里的玩家，开着房间也能看列表」→「「加入联机」页能看到正在进行的游戏」
- 去掉修饰与位置说明：「修复**使用**蒸汽平台**时**无法启动游戏」→「修复蒸汽平台无法启动游戏」；「**公开房间列表上方**显示正在进行的…」→「显示正在进行的…」
- 用词遵守 [launcher/CLAUDE.md](../../../launcher/CLAUDE.md)「文案」：对 Dota 2 说「启动」，运行状态说「开着」
- 英、俄文与中文逐条对应，同样短

## 第 5 步：下载验证

用 Claude in Chrome 打开 dev 站 `/launch` 点下载，再用 `Get-MpThreatDetection` 看有没有这个下载地址的新记录；有记录即被拦。
