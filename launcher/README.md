# 本机专用服启动器

玩家双击运行的 Windows 小程序 `Windy10v10AI.exe`：在本机单独开一个专用服再连进去，服务器和客户端分到不同核心，缓解后期卡顿。可以单人玩，也可以开房间让朋友加入。

联网行为、对电脑的改动与卸载方式见[代码签名政策](https://windy10v10ai.com/launch/code-signing)。

Apple Silicon Mac 的实验性启动器见 [macos/README.md](macos/README.md)。它使用独立测试版本，跨平台完整游戏仍待验证，不替代本页 Windows 正式版与官网发布入口。

## 设计决定

- **通过 Steam 启动 Dota 2**：直接运行 `dota2.exe` 会跳过 Steam 会话验证，之后从游廊开局会被 VAC 拦下。
- **Dota 开着时用 `steam://connect` 拉进游戏，不重启**：开着的 Dota 收不到启动参数。专用服不回应 Steam 的服务器查询，由启动器在本机代答；拉不进去时给控制台 `connect` 命令兜底。
- **`steam://` 链接交给 Steam 程序打开**，不经系统的协议关联：蒸汽平台不注册 `steam://`。
- **不修改 Dota 2 文件，不注入或读写 Dota 进程**：只新增地图硬链接与日志，免得触发反作弊。
- **启动器从不关闭 Dota 2**：只管自己开的专用服。
- **在不在游戏里只看本机端口的流量**：只有带参数启动的 Dota 才写日志；主动离开和掉线分不出来，都显示「进入游戏」。
- **单人结算保存完、离开游戏就关服务器**：不等 Dota 2 关闭，没人的专用服空转几分钟就会崩溃。
- **专用服用「高于正常」优先级**：房主的 Dota 2 在同一台电脑上渲染，服务器被抢走 CPU 时所有人一起卡。
- **「更新地图」对已订阅的地图再订阅一次**：Steam 的更新列表比发布晚，直接下载只拿到旧版，订阅会让 Steam 单独问最新版本。调用接口的进程会被 Steam 当成 Dota 2 在运行，所以放在子进程里做完就退出。
- **本机只存界面选择与头像缓存**：读写失败一律忽略，不用注册表。

## 联机

各阶段的取舍见 [docs/design/launcher-multiplayer/](../docs/design/launcher-multiplayer/)。

- **Dota 两边都只连本机**：跨网的只有两个启动器之间的 UDP 隧道，单人模式验证过的 Dota 行为不变。
- **API 只牵线**：开房、轮询、交换地址走 API，直连时游戏数据不经过我们的服务器。
- **不依赖公网 IP**：局域网、打洞、中转同时试，不用 UPnP。中转只转发、不看内容，服务器在 server 仓库。
- **中转的列表与排序在 API**：启动器上报到各台的延迟与丢包，API 排出顺序发给双方，增减中转、调优先级只需部署 API。
- **加入后实测一次再定路**：直连与中转比一次，中转明显更好才换，之后整局不换。
- **对玩家只分「直连」与「中转」**：单写「服务器」会和「服务器主机」混淆。
- **房间跨局保留，下一局由房主手动启动**：什么时候开、开什么难度是房主的事。
- **下一局先放房主进，再放加入者**：游戏内房主归第一个加载完的玩家，大家同时加载时电脑快的加入者会抢走；房主迟迟进不来就不再等。
- **房间按局记「已开始」**：下一局开始时房间重新开放加入。
- **两个勾选框，默认都勾上并记住**：房主「开房后自动启动 Dota 2」，加入者「房主启动下一局时自动进入」。加入者的 Dota 没开时不替玩家启动，以免把正在玩别的游戏的人拽出来。
- **房主不等人就开始，靠提示解决，不改默认**：多数房主本来一个人玩，默认不启动 Dota 会让他们每局多一步。
- **房主是唯一的状态来源**：玩家名单、游戏结束与结算完成都由房主读专用服日志得出，经隧道发给加入者，两边看到的一致。
- **联机要求地图最新**：双方地图版本不同进游戏可能出错。
- **开房与加入要先等 Steam 登录**：房间按 Steam 账号区分玩家。
- **与 game 仓库有两处约定，改动要两边同步**：专用服带固定的服务器名启动，游戏据此等房主开始；选队界面的房间状态由启动器在本机端口提供。

## 自我更新

- **版本信息与下载都走 API**：和地图检测同一套国内外线路。
- **只校验 sha256，不做代码签名**：哈希用来挡下载不完整或被代理损坏。
- **只升不降**：线上版本比自己新才提示，本地开发不会被换回旧版。

## 编译

```bat
launcher\build.cmd
```

产物在 `launcher/dist/Windy10v10AI.exe`。只依赖 Windows 自带的 .NET Framework 4 编译器，源码只能用 C# 5 语法。

## 发布

exe 放在官网 `/launch` 下载页，只从 `develop` 编译，每次发版分两个 PR：

1. 代码 PR：按 [CLAUDE.md](CLAUDE.md) 的「版本号」升版本，合进 `develop`。可以攒几个 PR 共用一个未发布的版本号。
2. 在 `develop` 上运行「Launcher release build」工作流（`gh workflow run launcher-release.yml --ref develop`），下载产物（`gh run download <run-id>`）。发布的 exe 必须来自这里，不用本机编译的。
3. 没有代码签名，每次发版都用本机 Defender 扫描，必须没有报毒，否则玩家一下载就被隔离；再上传 [VirusTotal](https://www.virustotal.com/)，两项结果写进发版 PR 的测试清单。Microsoft 一栏的 `!ml` 是云端机器学习判定，与本机不一致时以本机为准，到[误报申报页](https://www.microsoft.com/en-us/wdsi/filesubmission)提交后即可继续；报具体病毒家族、或大量引擎一起报时先停下排查。
4. 发版 PR：
   - 把 exe 复制为 `web/public/downloads/Windy10v10AI-<version>.exe`，删掉旧版。
   - 改 `web/app/launch/launcher.ts` 的 `LAUNCHER_VERSION`。
   - 改 `api/src/launcher/launcher-release.service.ts` 的版本号与 sha256（运行摘要里有）。抄错时 api 单测会失败。
   - 在官网 `/launch` 的更新日志加本版条目（`web/app/launch/changelog.ts` 与三语 `launch.changelog.entries`）。只列对玩家影响大的变化，小修小改合成一句；未发布的版本并进本版。
5. 发版 PR 合进 `develop` 后，从 dev 站（`https://dev--windy10v10ai.asia-east1.hosted.app/launch`）实际下载一次，Defender 不拦截才请用户审批 Release PR。下载时的云端判定与 VirusTotal 上的 Microsoft 一栏不是同一条，前面两项都干净也可能被拦；被拦就到误报申报页提交，等微软放行、重新下载不报再上线。

同一版本号每次编译的 sha256 都不同，填的必须是放进官网的那一个。发版 PR 合进 `develop` 后由用户审批 Release PR 上线（见根目录 [CLAUDE.md](../.claude/CLAUDE.md) 的「合并方式」）；请用户审批前，确认 `web/public/downloads/` 里只有这次的改动：exe 在 diff 里只显示为二进制变更，线上玩家会自动更新到它。
