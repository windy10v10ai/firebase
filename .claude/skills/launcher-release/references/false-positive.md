# 申报 Defender 误报

VirusTotal 的 Microsoft 一栏报 `!ml`，dev 站下载被拦，或玩家反馈下载后被隔离时，用 Claude in Chrome 申报，用户的 Chrome 已登录微软账号：

- 申报页选「Software developer」，产品选「Microsoft Defender Antivirus (Windows 11)」，Company Name 填 `Windy10v10AI`，「What do you believe this file is?」选「Incorrectly detected as malware/malicious」，Detection name 填 VirusTotal 上的检出名，玩家被隔离的以 `Get-MpThreatDetection` 查到的 ThreatID 为准，用 `Get-MpThreat` 换成名字（0.7.1 是 `Trojan:Win32/Yomal!rfn`）
- 文件传这个版本签名后的 exe。仓库里的和重新取出的副本会被本机 Defender 当场再隔离，Claude 读不到也不能改排除项：请用户在 Windows 安全中心「保护历史记录」对该条选「允许」并还原，再核对 SHA-256 与发版时一致
- 上传框是普通的 file input，`find` 拿到 ref 后直接 `file_upload`；文件要先复制到会话临时目录
- Additional information 用下面的模板，英文，一段，只写事实
- 最后一页「Review your submission」有验证码，Claude 不能代填：滚到验证码处，请用户填验证码并点 Submit
- 提交后在 [Submission history](https://www.microsoft.com/en-us/wdsi/submissionhistory) 记下 Submission ID。记录只保留 30 天，超过一个月没出结果的重新提交，不在旧申报上等

提交完的详情页 Status 是 Submitted、Final determination 显示 Malware 属正常：那是提交瞬间的自动扫描，分析员审完状态变 Completed 才是结论。仍报毒时用页面上的「File a dispute」。

完成条件：用户已点 Submit。

## Additional information 模板

0.7.0 用这个结构一天内通过。要点：先说是什么、源码和编译方式可查，再给 SHA-256 和扫描结果，最后明确请求放行。不要写 HTML 实体（页面会把 `'` 转成 `&amp;#39;`），文中不用撇号。

```
This is Windy10v10AI Launcher <版本>, an open-source launcher for the Windy10v10AI Dota 2 custom game.
Source: https://github.com/windy10v10ai/firebase/tree/develop/launcher
The exe is built by GitHub Actions from that public repository (workflow: https://github.com/windy10v10ai/firebase/blob/develop/.github/workflows/launcher-release.yml) and downloaded from https://windy10v10ai.com/launch.
It starts a local game server for the player and connects to the game API. It is code-signed with a Certum open source code signing certificate.
SHA-256: <sha256>
Local Microsoft Defender scan reports no threats. VirusTotal shows Microsoft as undetected, with only generic ML detections from a few third-party engines.
Several players report that Windows quarantines the downloaded file. Please confirm it is clean and add it to your allow list.
```

「Several players report」一句只在玩家反馈被隔离时保留，提前申报的版本删掉。
