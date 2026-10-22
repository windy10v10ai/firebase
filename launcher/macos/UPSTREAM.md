# 上游出处与许可

基于 Windy10v10AI Launcher，Copyright (C) 2022–2026 windy and contributors。

源版本：[windy10v10ai/firebase launcher，dfe5dc759ef0c6a99ad3397209ef40cae09ca1a0](https://github.com/windy10v10ai/firebase/tree/dfe5dc759ef0c6a99ad3397209ef40cae09ca1a0/launcher)。

`Core/*.cs`、`Tests/LocalGateTests.cs` 和 `Tests/RelayTests.cs` 衍生自该版本。Mac 适配移除 Windows 注册表和 socket IOControl 依赖，保留协议 3 的报文格式、STUN 和中转握手；新增 macOS 生命周期管理、JSON 兼容层、AppKit 界面与集成测试。

衍生源码使用同一 GPL-3.0 许可，并保留上游 Steam 分发附加许可，见 [LICENSE](LICENSE) 与 [LICENSE.EXCEPTIONS.md](LICENSE.EXCEPTIONS.md)。Microsoft 运行时的许可证和第三方声明见 `Notices/`；构建时一并复制进应用。

这是独立的实验性 Mac 移植，不代表上游已接受或认可，也不替代上游 Windows 正式发布流程。应用不分发 Valve 游戏可执行文件；运行时从用户本机安装生成专用服临时副本。
