# launcher/ 规约

启动器做什么、发版流程与理由见 [README.md](README.md)。

## 版本号

- 每个改 `launcher/` 的 PR 都升版本：`src/Launcher.cs` 的 `Version`、`AssemblyVersion`、`AssemblyFileVersion` 三处一致。修 bug 升第三位，新增玩家可见功能升第二位
- PR「概要」写明升级前后的版本与幅度，如「版本 0.3.2 → 0.3.3（修 bug，升第三位）」，review 时不用翻 diff 就能判断是小版本还是大版本

## 校验

- `launcher\build.cmd` 编译通过，并核对 `launcher/dist/Windy10v10AI.exe` 的文件版本等于新版本号

## VirusTotal 扫描

发版前的扫描（理由见 README「发布」第 3 步）用 Claude in Chrome 自动上传，不用 API（要填密钥）：

- 上传框藏在 `vt-ui-main-upload-form` 的 shadow DOM 里，`find` / `file_upload` 拿不到 ref。先用 `javascript_tool` 往 `document.body` 插一个带 `aria-label` 的 `<input type="file">`，`file_upload` 传给它，再用 `DataTransfer` 把文件赋给 shadow DOM 里的第二个 file input 并派发 `change`，页面会弹出「Confirm upload」，同样在 shadow DOM 里找到这个按钮调 `click()` 即开始扫描
- 应用内置浏览器（`mcp__Claude_Browser__*`）没有 `file_upload`，本机文件进不了页面，只能请用户手动选文件
- 扫描完成后页面跳到 `/gui/file/<sha256>`；结果在 shadow DOM 里，`get_page_text` 读不到，用 `javascript_tool` 递归拼 `shadowRoot` 的文本，取检出数与 Microsoft 一栏

## PR 截图

改了玩家能看到的窗口或文案时，PR 放改动后的截图，中、英、俄三种语言各一张，默认不拍改动前。

- **不走真实开局流程**：写一个测试程序，用反射加载 `dist/Windy10v10AI.exe`，`Activator.CreateInstance` 建 `MainForm`，再调用私有方法让窗口进入要拍的状态（报错提示用 `Finish(message, false)`）。`Finish` 会把 `stopping` 置为 `true`，连续拍多条时每次调用后要重置回 `false`，否则后面的提示不显示
- **每种语言单独起一个进程**，启动时先设 `CurrentUICulture`：`Strings` 在第一次被访问时就定下了语言
- **窗口放到屏幕外，用 `ShowWindow(SW_SHOWNOACTIVATE)` 显示，用 `PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT)` 出图**：不抢焦点，被全屏的游戏挡住也照样拍得到
- **不调用会枚举或结束 `dota2` 进程的方法**（`OnModeClick`、`Run`）：开发者本机常开着 Dota 在测别的改动
- 标题栏图标会显示成测试程序的图标，正文里注明一句
- 图片存放与链接格式同 web，放 `assets` 分支的 `pr/<PR 编号>/`，见 [web/CLAUDE.md](../web/CLAUDE.md) 的「图片存放」
