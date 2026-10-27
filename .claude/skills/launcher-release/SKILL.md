---
name: launcher-release
description: 发布启动器新版本，或更新官网 /launch 的启动器更新日志。
---

# 发布启动器

按 [launcher/README.md](../../../launcher/README.md)「发布」五步走，流程与理由以那里为准。下面只补第 3–5 步的操作。

## 第 3 步：扫描

本机 Defender：`& "$env:ProgramFiles\Windows Defender\MpCmdRun.exe" -Scan -ScanType 3 -File <exe> -DisableRemediation`。

VirusTotal 用 Claude in Chrome 上传，不用 API（要填密钥）。应用内置浏览器没有 `file_upload`，只能请用户手动选文件。

- 上传框在 `vt-ui-main-upload-form` 的 shadow DOM 里，`find` 拿不到：先用 `javascript_tool` 往 `document.body` 插一个带 `aria-label` 的 `<input type="file">`，`file_upload` 传给它，再用 `DataTransfer` 赋给 shadow DOM 里的第二个 file input 并派发 `change`，最后在 shadow DOM 里找到「Confirm upload」调 `click()`
- 完成后跳到 `/gui/file/<sha256>`。单次 `javascript_tool` 超过 45 秒会超时，分几次轮询；结果用 `javascript_tool` 递归拼 `shadowRoot` 文本来读

Microsoft 一栏报 `!ml` 时，按 `references/false-positive.md` 申报误报。大版本（升第二位及以上）不论扫描结果干净与否都申报一次，理由见 README 第 3 步。

完成条件：Defender 输出 `found no threats`，VirusTotal 的检出数与 Microsoft 一栏已写进发版 PR 的测试清单；大版本另已提交误报申报。

## 第 4 步：更新日志

写在 `web/app/launch/changelog.ts` 与三语 `launch.changelog.entries`，英、俄文与中文逐条对应。

- 每版 1–3 条，每条一句，只写玩家能感觉到的变化；只剩小修就写「修复了一些问题」
- 只写结果，删掉实现机制、带来的好处、修饰与位置说明。用户改稿的典型删法：
  - 「直连不上时自动改走中转服务器，和朋友联机更容易成功」→「优化联机方式，解决部分玩家无法连接的问题」
  - 「「加入联机」页能看到正在进行的游戏和房里的玩家，开着房间也能看列表」→「「加入联机」页能看到正在进行的游戏」
  - 「修复使用蒸汽平台时无法启动游戏」→「修复蒸汽平台无法启动游戏」
- 用词按 [launcher/CLAUDE.md](../../../launcher/CLAUDE.md)「文案」

完成条件：每条都是一句结果，三语条数一致。

## 第 5 步：下载验证

用 Claude in Chrome 打开 dev 站 `/launch` 点下载，再用 `Get-MpThreatDetection` 查这个下载地址有没有新记录。被拦时按 `references/false-positive.md` 申报。

完成条件：没有新记录，或申报已提交。
