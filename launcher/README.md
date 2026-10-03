# 本机专用服启动器

玩家双击运行的 Windows 小程序 `Windy10v10AI.exe`：在本机单独开一个专用服再连进去，服务器和客户端分到不同核心，缓解后期卡顿。只支持单人。

## 做了什么

1. 找到 Steam 里的 Dota 2 和已订阅的地图，检查地图是否最新。
2. 在后台启动专用服，等地图加载完成。
3. 通过 Steam 启动 Dota 2 并自动连进去；游戏退出后关闭专用服。

客户端用 `steam.exe -applaunch` 启动：直接运行 `dota2.exe` 会跳过 Steam 的会话验证，打完一局不退出 Dota 再从游廊开局时被 VAC 拦下；没用 `steam://run`，因为带参数时会弹 Steam 确认框。

每次打开时查一次有没有新版本，有就在提示条上给出「更新」按钮，点击后下载、替换自己并重启。

联网行为、对电脑的改动与卸载方式见[代码签名政策](https://windy10v10ai.com/launch/code-signing)。

## 不修改 Dota 2 文件

启动器不改 Dota 2 原有的任何文件，也不注入或读写 Dota 进程。它只新增地图目录 `game/dota_addons/<地图ID>/`（工坊地图文件的硬链接）和专用服日志。

所以不采用 A2S 方案：它能让已开着的 Dota 直接连进重开的专用服，但要改玩家的 `gameinfo.gi`，有触发反作弊握手失败的风险。再开一局仍需先关闭 Dota。

## 自我更新

- **版本信息与下载都走 API**：国内代理只转发 `/api/`，大陆玩家先直连、失败再走代理，和地图检测同一套路线。
- **只校验 sha256，不做代码签名**：发版只有维护者本人能部署，哈希用来挡下载不完整或被代理损坏；以后要加签名，旧版会先自动更新到带公钥的版本，不需要玩家手动下载。
- **只升不降**：线上版本比自己新才提示，本地开发时把版本号定得比线上高，不会被换回旧版。
- 封闭测试版（`build.cmd beta`）不检查更新。

## 编译

```bat
launcher\build.cmd
```

产物在 `launcher/dist/Windy10v10AI.exe`。只依赖 Windows 自带的 .NET Framework 4 编译器，源码只能用 C# 5 语法。

## 发布

exe 放在官网 `/launch` 下载页，只从 `develop` 编译，每次发版分两个 PR：

1. 代码 PR：每个改启动器的 PR 都同时升 `src/Launcher.cs` 的 `Version`、`AssemblyVersion` 与 `AssemblyFileVersion`（修 bug 升第三位，新增玩家可见功能升第二位），合进 `develop`。可以攒几个再发版，没发布的版本号跳过即可。
2. 在 `develop` 上运行「Launcher release build」工作流（`gh workflow run launcher-release.yml --ref develop`），下载产物（`gh run download <run-id>`）。其他分支、或版本号不比线上新时会直接失败。发布的 exe 必须来自这里，不用本机编译的。
3. 把这个 exe 上传到 [VirusTotal](https://www.virustotal.com/) 扫描，Microsoft 一栏必须是 Undetected，检出数写进发版 PR 的测试清单。Defender 报毒时玩家一下载就被隔离，其他引擎零星报毒可以接受。
4. 发版 PR：
   - 把 exe 复制为 `web/public/downloads/Windy10v10AI-<version>.exe`，删掉旧版。
   - 改 `web/app/launch/launcher.ts` 的 `LAUNCHER_VERSION`。
   - 改 `api/src/launcher/launcher-release.service.ts` 的版本号与 sha256（运行摘要里有）。抄错时 api 单测会失败。

同一版本号每次编译的 sha256 都不同，填的必须是放进官网的那一个。

合并 Release PR 前，确认 `web/public/downloads/` 里只有自己这次的改动：exe 在 diff 里只显示为二进制变更，线上玩家会自动更新到它。
