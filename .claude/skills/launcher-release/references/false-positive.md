# 申报 Defender 误报

VirusTotal 的 Microsoft 一栏报 `!ml`，或 dev 站下载被拦时，用 Claude in Chrome 申报，用户的 Chrome 已登录微软账号：

- 申报页选「Software developer」，产品选「Microsoft Defender Antivirus (Windows 11)」，Company Name 填 `Windy10v10AI`，「What do you believe this file is?」选「Incorrectly detected as malware/malicious」，Detection name 填 VirusTotal 上的检出名，Additional information 用英文写清这是本仓库的开源启动器、源码与下载地址、由 GitHub Actions 编译、本机 Defender 不报
- 上传框是普通的 file input，`find` 拿到 ref 后直接 `file_upload`；文件要先复制到会话临时目录
- 最后一页「Review your submission」有验证码，Claude 不能代填：滚到验证码处，请用户填验证码并点 Submit

完成条件：用户已点 Submit。
