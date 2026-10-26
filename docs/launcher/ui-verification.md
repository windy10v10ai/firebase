# 启动器界面验证

日常采用 **Windows 本机验证、Mac 按需截图、AI 审图**，减少切换电脑和维护截图框架的成本。常规 PR CI 持续执行两平台的构建、格式和离线测试。

## Windows 本机验证

AI 按本次改动操作真实窗口、截图并检查三语长文案、控件显隐、文字截断和按钮重叠。难以进入的状态，在会话临时目录补最小预览辅助；截图方法和不干扰游戏的要求见 [PR 截图规约](../../launcher/CLAUDE.md#pr-截图)。

房间选项相关改动保留以下必测项：

- 保存「创建房间」页后重新启动，选项立即可见，位置与切换标签回来一致。
- 分别取消房主自动启动、加入者自动跟随，重新启动后保持选择，两项互不影响。
- 加入者在游戏中、等待和结束时均能修改跟随选项；取消后下一局仍可手动进入。
- 重新勾选不会立即进入当前已准备好的游戏，离房后隐藏选项。

这些是本机检查清单；已有行为测试继续验证对应规则，截图不替代保存或联机行为测试。

## Mac 按需截图

在仓库 Actions 选择 **Launcher Mac UI previews**，点击 **Run workflow**，选择待验证分支、场景 `scope`（`host`、`join`、`feedback`、`all`）和语言 `language`（`zh-CN`、`en-US`、`ru-RU`、`all`）。[工作流](../../.github/workflows/launcher-ui.yml)合入默认分支 `develop` 后才有手动运行入口。

也可在 Windows 或 Mac 上使用 GitHub CLI：

```bash
gh workflow run launcher-ui.yml --ref <待验证分支> -f scope=all -f language=all
gh run list --workflow launcher-ui.yml
gh run download <run-id> -n launcher-ui-macos -D <图片目录>
```

远端 Mac 构建并运行真实 AppKit 预览，注入模拟状态，不启动 Steam、Dota 或真实房间，也不修改玩家保存的选择。原图、日志、报告和 `index.html` 缩略总览自动保存为 Actions 产物；从运行摘要下载，解压后打开总览并检查原图。产物按工作流策略过期，需长期放在 PR 的精选图片按截图规约处理。工作流不自动公开发布图片或发布安装包。

Mac 本机也可在构建后运行相同入口：

```bash
bash launcher/macos/test-ui.sh <绝对输出目录> host zh-CN
python3 launcher/ui-preview-summary.py <绝对输出目录>
```

## 审查与维护

AI 检查目标画面是否正确、三语文字是否完整，以及按钮和选项是否重叠。成功生成 PNG 只代表渲染成功，不代表审图通过。

现有画面改布局、文案或配色，重新取图即可；Mac 新页面或状态补到 AppKit 预览和 [截图脚本](../../launcher/macos/test-ui.sh)，通常不用改工作流。输入、构建入口或产物方式变化时才修改工作流。缩略总览由 [ui-preview-summary.py](../../launcher/ui-preview-summary.py)生成。

Steam 登录、Dota 冷启动与复用、跨平台真实联机、高 DPI 和长时间运行仍需实机验证。
