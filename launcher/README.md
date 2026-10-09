# 本机专用服启动器

玩家双击运行的 Windows 小程序 `Windy10v10AI.exe`：在本机单独开一个专用服再连进去，服务器和客户端分到不同核心，缓解后期卡顿。可以单人玩，也可以开房间让朋友加入。

联网行为、对电脑的改动与卸载方式见[代码签名政策](https://windy10v10ai.com/launch/code-signing)。

## 设计决定

- **通过 Steam 启动 Dota 2**：用 `-applaunch` 而不是直接运行 `dota2.exe`，后者跳过 Steam 会话验证，之后从游廊开局会被 VAC 拦下；不用 `steam://run`，带参数时会弹确认框。
- **不修改 Dota 2 文件**：不改原有文件，也不注入或读写 Dota 进程，只新增地图硬链接与日志。所以不采用 A2S 方案，它要改玩家的 `gameinfo.gi`，有触发反作弊的风险。
- **启动器从不关闭 Dota 2**：只管自己开的专用服。重新进入游戏时例外，被断开的 Dota 不认第二次启动，只能先关掉。
- **结算保存完、没人在局内就关服务器**：单人与联机同一条件，不等 Dota 2 关闭。房间解散后专用服会空转并在几分钟内崩溃；游戏结束后服务器退出也不算故障。
- **专用服用「高于正常」优先级**：房主的 Dota 2 在同一台电脑上渲染，服务器被抢走 CPU 时所有人一起卡顿甚至断线。
- **本机只存界面选择与头像缓存**：读写失败一律忽略，不用注册表。

## 联机

设计与取舍见 [docs/design/launcher-multiplayer/](../docs/design/launcher-multiplayer/) 下的各阶段设计文档。

- **Dota 两边都只连本机**：跨网的只有两个启动器之间的 UDP 隧道，单人模式验证过的 Dota 行为不变。
- **API 只牵线**：开房、轮询、交换地址走 API；直连时游戏数据不经过我们的服务器。
- **不依赖公网 IP**：局域网、打洞、中转同时试，按这个优先级取用；不用 UPnP。中转只转发、不看内容，服务器在 server 仓库。
- **多台中转由 API 排序**：中转列表与优先级写在 API 里；启动器加入前测每台的延迟与丢包，随已有的轮询、加入请求上报，API 每次加入排出一个顺序发给房主与加入者，双方按同一顺序连，被以「已满」拒绝时换下一台。增减中转、调优先级只需部署 API；双方都是新版才会用到第一台以外的中转，旧版只测、只连第一台。
- **对玩家只分「直连」与「经服务器」**：玩家只需要知道走哪条路和延迟，不需要知道为什么连不通。
- **房主是唯一的状态来源**：玩家名单、游戏结束与结算完成都由房主读专用服日志得出，再经隧道发给加入者，两边看到的一致。不跟踪 Dota 内的掉线与重连。
- **联机要求地图最新**：双方地图版本不同进游戏可能出错。
- **开房与加入要先等 Steam 登录**：房间按 Steam 账号区分玩家。
- **与 game 仓库有两处约定，改动要两边同步**：专用服带固定的服务器名启动，游戏据此关掉自动开局、等房主开始；选队界面的房间状态由启动器在本机端口提供，游戏读不到时不显示。

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
3. 没有代码签名，每次发版都用本机 Defender 扫描，必须没有报毒，否则玩家一下载就被隔离；再上传 [VirusTotal](https://www.virustotal.com/)，两项结果写进发版 PR 的测试清单。Microsoft 一栏的 `!ml` 是云端机器学习判定，与本机不一致时以本机为准，到[误报申报页](https://www.microsoft.com/en-us/wdsi/filesubmission)提交后即可发版；报具体病毒家族、或大量引擎一起报时先停下排查。
4. 发版 PR：
   - 把 exe 复制为 `web/public/downloads/Windy10v10AI-<version>.exe`，删掉旧版。
   - 改 `web/app/launch/launcher.ts` 的 `LAUNCHER_VERSION`。
   - 改 `api/src/launcher/launcher-release.service.ts` 的版本号与 sha256（运行摘要里有）。抄错时 api 单测会失败。
   - 在官网 `/launch` 的更新日志加本版条目（`web/app/launch/changelog.ts` 与三语 `launch.changelog.entries`）。只列对玩家影响大的变化，小修小改合成一句；未发布的版本并进本版。

同一版本号每次编译的 sha256 都不同，填的必须是放进官网的那一个。发版 PR 合进 `develop` 后由用户审批 Release PR 上线（见根目录 [CLAUDE.md](../CLAUDE.md) 的「合并方式」）；请用户审批前，确认 `web/public/downloads/` 里只有这次的改动：exe 在 diff 里只显示为二进制变更，线上玩家会自动更新到它。
