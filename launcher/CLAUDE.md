# launcher/ 规约

启动器做什么、发版流程与理由见 [README.md](README.md)。发版时加载 [launcher-release](../.claude/skills/launcher-release/SKILL.md) 技能：扫描、误报申报、下载验证的操作与更新日志写法都在那里。

## 版本号

- 改 `launcher/` 的 PR 只在当前版本号已经发布过时升版本：`core/LauncherVersion.cs` 的 `Current` 等于 `api/src/launcher/launcher-release.service.ts` 里的线上版本就升，已经比线上高（攒着还没发版）就不动。exe 的文件版本与各平台都从它取，不在别处另写版本号。修 bug 与小功能升第三位，明显改善玩家体验的新功能（如联机、公开房间）升第二位。拿不准时问用户
- PR「概要」写明升级前后的版本与幅度，如「版本 0.3.2 → 0.3.3（修 bug，升第三位）」，review 时不用翻 diff 就能判断是小版本还是大版本；没升时写明并入哪个未发布的版本，如「并入未发布的 0.5.0」

## 功能边界

- Mac 功能以 Windows 为基准，必须保持对应功能；精简实现不等于删减功能。不直接接收移植版本独有功能，也不加入未被 Windows 功能或当前平台需求证明有必要的扩展。Mac 与 Windows 的功能入口、分组、顺序和主要排版保持一致；原生控件的交互与细节样式可遵循各平台习惯。改界面时逐状态对照 Windows，不能只对齐配色。

## 文案

- 对 Dota 2 说「启动」，不说「打开」，说的是动作；描述 Dota 2 正在运行的状态说「开着」，避免和「启动器」撞字；进游戏的按钮不管第几次进都叫「进入游戏」
- 房间跨局：房主「启动下一局」「关闭房间」，加入者「离开房间」；游戏结束写「游戏已结束」，对已经开始的这一局不说「下一局」
- 玩家状态：两局之间写「在房间里」，服务器启动中写「等待连接」
- 提示只写玩家下一步要做什么，一句话；玩家没得选的事不解释
- 等人开局的提示写成「等待……加入后，从 Dota 2 里点「锁定并开始」」

## 共用核心

`core/` 是 Windows 与 Mac 共用的联机代码，理由见 [README.md](README.md) 的「代码结构」。

- 会话、平台执行与界面按 [README](README.md#代码结构) 的三层边界组织；房间流程和规则在共通会话维护，JSON 消息留在 Mac 界面适配层。
- `core/` 只用 C# 5 语法，不引用 Windows 专用 API（注册表、`DllImport`、WinForms、`System.Drawing`），也不引用 `src/` 里的类型
- 核心要用到系统能力时，在 `Platform` 加方法，每个平台的实现都补上：Windows 是 `src/Platform.cs`，Mac 是 `macos/Platform.cs`，核心测试是 `core/tests/dotnet/TestPlatform.cs`
- 与平台无关的测试放 `core/tests/`，并加进 `core/tests/dotnet/Program.cs` 与 `tests/SteamExecutableTests.cs` 两处入口

## 网络

- 新建的 socket 都要调 `Platform.KeepPrivate`：启动器以继承句柄的方式启动 Steam 与 Dota，被继承的 socket 在启动器退出后仍占着端口

## 校验

- PR 的 CI 只调用现有脚本做构建和测试；打包、上传安装包和发布验证放在官方发布工作流，避免重复维护。

- `launcher\test.cmd` 通过
- `launcher\build.cmd` 编译通过，并核对 `launcher/dist/Windy10v10AI.exe` 的文件版本等于 `LauncherVersion.Current`
- 改了 `core/` 时，`dotnet run --project launcher/core/tests/dotnet/CoreTests.csproj` 通过（Mac 或 Linux 上跑，CI 的 `launcher-core-mac` 任务也跑这一条）
- `dotnet format whitespace launcher --folder --verify-no-changes` 通过（Mac 或 Linux 上跑，CI 的 `launcher-core-mac` 任务也跑这一条），检查 `launcher/` 下全部 `.cs`。规则在 `launcher/.editorconfig`；不通过时去掉 `--verify-no-changes` 自动修正

## PR 截图

改了玩家能看到的窗口或文案时，PR 放改动后的截图，中、英、俄三种语言各一张，默认不拍改动前。

- **Windows 本机验证，Mac 按需取图**：Windows 由 AI 在本机操作、截图并审图；Mac 使用独立的「Launcher Mac UI previews」工作流选择场景和语言。常规 PR CI 保留构建和离线测试。方法与 Windows 必测清单见 [界面验证](../docs/launcher/ui-verification.md)。
- **按改动补最小预览辅助**：Mac 新页面、弹窗或状态补入现有预览入口；Windows 难以进入的状态可在会话临时目录写最小反射程序。
- **测试程序与截图放会话的临时目录，不放 `dist/`**：`dist/` 只放编译出的 `Windy10v10AI.exe`，测试程序用反射加载它即可。临时文件混在里面，分不清哪个是要发布的产物
- **不走真实开局流程**：写一个测试程序，用反射加载 `dist/Windy10v10AI.exe`，`Activator.CreateInstance` 建 `MainForm`，再调用私有方法让窗口进入要拍的状态（报错提示用 `Finish(message, false)`）。`Finish` 会把 `stopping` 置为 `true`，连续拍多条时每次调用后要重置回 `false`，否则后面的提示不显示
- **每种语言单独起一个进程**，启动时先设 `CurrentUICulture`：`Strings` 在第一次被访问时就定下了语言
- **窗口放到屏幕外，用 `ShowWindow(SW_SHOWNOACTIVATE)` 显示，用 `PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT)` 出图**：不抢焦点，被全屏的游戏挡住也照样拍得到
- **不调用会枚举或结束 `dota2` 进程的方法**（`OnModeClick`、`Run`）：开发者本机常开着 Dota 在测别的改动
- **拍完逐张审图，不只确认拍到了**：对照设计稿或改动前的窗口看布局与对齐、文字（截断、意外折行、俄语撑出按钮或窗口、缺字）、图片（拉伸、挤压变形）。有问题先修再重拍，带问题的图不进 PR
- 标题栏图标会显示成测试程序的图标，正文里注明一句
- 图片存放与链接格式同 web，放 `assets` 分支的 `pr/<PR 编号>/`，见 [web/CLAUDE.md](../web/CLAUDE.md) 的「图片存放」
