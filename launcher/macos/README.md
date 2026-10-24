# Mac 启动器（开发中）

Apple Silicon Mac 平台实现，与 Windows 共用联机核心、版本和三语文案。当前工作是接替 [#1572](https://github.com/windy10v10ai/firebase/pull/1572) 完成适配；尚未作为官方 Mac 版本发布。

## 构建与离线测试

需要 Apple Silicon Mac、Xcode Command Line Tools、.NET SDK 10、Python 3，以及恢复 .NET 包的网络连接。

```bash
bash launcher/macos/test.sh
bash launcher/macos/build.sh
```

`DOTNET_BIN` 可指定 SDK，`APP_OUT` 可指定应用输出目录。构建脚本从共用版本定义生成应用和引擎版本，导出三语资源，并执行本地 ad hoc 签名与签名验证。官方工作流的签名、公证配置与构建验证另见 [#1598](https://github.com/windy10v10ai/firebase/issues/1598)。地图更新辅助程序需要 Rosetta。

`test.sh` 单独启用测试构建，正常应用不编入测试源码和真实房间诊断命令。离线 self-test 使用动态端口，不启动 Steam、游戏或真实房间。`--live-test`、`--transport-test`、`--join-room-test` 会访问真实服务，`--enter-client` 会启动或连接游戏，不属于离线校验。

## 尚需实机验收

- Steam 冷启动、客户端复用，以及游戏结束后不退出 Dota 再从游廊开局的 VAC 验证。
- Windows / Mac 双向开房加入、完整游戏、跨局、断线及退出清理。
- 资源队列溢出与长时间稳定性。
- 当前 Windows 功能和三语界面的完整对齐。

原作者的历史测试记录见 [#1572](https://github.com/windy10v10ai/firebase/pull/1572)，不代表当前版本通过实机验收。官网下载页面修改与正式发版由 [#1599](https://github.com/windy10v10ai/firebase/issues/1599) 跟踪。架构见 [Mac 平台说明](../../docs/launcher/macos.md)，贡献来源见 [UPSTREAM.md](UPSTREAM.md)。

## 首次运行提示

不在 `/Applications` 或 `~/Applications` 里运行时，启动先弹原生窗口问「移到应用程序」还是「直接运行」，可勾「不再提示」。移动时复制进 `~/Applications`，不要求管理员权限；复制后验证签名，同名应用确认后才替换，任何一步失败都保留原应用并继续从当前位置运行。移动成功后从新位置另开一个实例并退出当前进程。这个提示不替代 macOS 对下载应用的安全检查，不做安装向导。
