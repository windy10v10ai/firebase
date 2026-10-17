# WindyMac 0.2.0（实验版）

Apple Silicon（M 系列、ARM64）Mac 启动器：创建私密房间，或输入房间码加入朋友用 Windows / Mac 启动器创建的房间。使用上游协议 3，跨平台完整游戏仍待实机联测。

## 使用

1. 通过 Steam 安装 Dota 2，登录自己的账号，订阅地图 `2307479570`。
2. 双击 `WindyMac.app`，点击“更新地图”，等待下载完成；朋友也要更新地图和 Windows 启动器。
3. 自己开房：选择“创建房间”，设置难度与人数后创建；加入朋友：选择“加入房间”，粘贴朋友提供的房间码后加入。勾选自动进入时，启动器自动启动或复用 Dota，等待主菜单后连接；冷启动可能需要数分钟。
4. 房主将房间码发给朋友，大家加入后由房主在 Dota 中开始游戏。加入者等待房主的服务器准备好后才能进入。
5. 自动进入失败时，点击“进入游戏”重试；也可复制连接命令，在 Dota 控制台执行。
6. 房主在游戏结束后点击“启动下一局”；加入者留在房间等待。勾选自动进入且 Dota 开着时，下一局准备好后自动连接，也可点击“进入游戏”。
7. 房主点击“关闭房间”；加入者点击“离开房间”。关闭启动器清理自己的房间或加入连接，保留 Dota 客户端。

日志位于 `~/Library/Logs/WindyMac/`，可能包含 Steam ID，分享前请检查。应用使用本地 ad hoc 签名，未做 Apple Developer ID 签名或公证。地图更新辅助程序使用 Dota 自带的 Intel Steam API，需要 Rosetta。

这是独立的 Mac 测试版，不替代官网 Windows 发布版。长时间稳定性、Windows 实机完整游戏及后续游廊切换未验证，见[测试报告](TEST-REPORT.md)。

## 构建与测试

需要 Apple Silicon Mac、Xcode Command Line Tools、.NET SDK 10、Python 3，以及恢复运行时包的网络连接：

```bash
cd launcher/macos
./test.sh
./build.sh
```

默认产物为 `dist/WindyMac.app`，自带 ARM64 .NET 运行时。可用 `DOTNET_BIN` 指定 SDK，`APP_OUT` 指定应用输出路径。打包：

```bash
ditto -c -k --sequesterRsrc --keepParent dist/WindyMac.app WindyMac.zip
```

应用内离线测试不需要另装 .NET：

```bash
dist/WindyMac.app/Contents/Resources/engine/WindyMacEngine --self-test
```

以下测试会使用当前 Steam 账号创建真实私密房间，结束后关闭房间；加 `--enter-client` 会启动或复用 Dota，连接后观察稳定性：

```bash
dist/WindyMac.app/Contents/Resources/engine/WindyMacEngine --live-test --enter-client
```

只验证一个真实房间的加入连接（不挂载地图、不启动 Dota，使用临时转发端口，可与现有房间共存）：

```bash
dist/WindyMac.app/Contents/Resources/engine/WindyMacEngine --join-room-test 六位房间码
```

该命令会以当前 Steam 账号加入后离开，会出现在房主名单中；连接通过不代表客户端已经进图。

架构、客户端启动差异及数据行为见 [Mac 启动器设计](../../docs/launcher/macos.md)。源码采用 GPL-3.0，并保留上游 Steam 分发附加许可；出处见 [UPSTREAM.md](UPSTREAM.md)，许可证见 [LICENSE](LICENSE) 与 [LICENSE.EXCEPTIONS.md](LICENSE.EXCEPTIONS.md)。Microsoft 运行时声明随源码 `Notices/` 和应用保留。
