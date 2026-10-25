# 启动器跨平台界面验证

Windows 与 Mac 的界面截图按需运行，开发时无需为了检查另一平台的布局切换电脑。常规 PR CI 持续执行构建、格式和离线测试；界面变化时运行独立的 **Launcher UI previews** 工作流。

## 运行与取图

工作流文件是 [launcher-ui.yml](../../.github/workflows/launcher-ui.yml)。合入默认分支 `develop` 后，可在仓库 Actions 中选择工作流、点击 **Run workflow**，再选择待验证分支。

| 输入 | 用途 |
|---|---|
| `platform` | `windows`、`macos` 或 `both` |
| `scope` | 房主 `host`、加入者 `join`、反馈 `feedback` 或全部 `all` |
| `language` | `zh-CN`、`en-US`、`ru-RU` 或全部 `all` |

也可以在任意开发电脑上通过 GitHub CLI 触发：

```bash
gh workflow run launcher-ui.yml --ref <待验证分支> -f platform=both -f scope=all -f language=all
gh run list --workflow launcher-ui.yml
gh run download <run-id> -n launcher-ui-windows -D <Windows图片目录>
gh run download <run-id> -n launcher-ui-macos -D <Mac图片目录>
```

Windows 与 Mac 分别在 GitHub 托管的对应系统中构建并运行原生界面。每个平台的产物包含 PNG 原图、日志、报告和 `index.html` 缩略总览。运行摘要提供下载链接；解压后打开 `index.html`，点击缩略图检查原图。产物会按工作流的保留策略过期，需要长期留在 PR 的精选图片按 [PR 截图规约](../../launcher/CLAUDE.md#pr-截图)处理。

工作流只上传测试产物，不自动将图片发布到 `assets` 分支，也不生成安装包或发布版本。

## 验证范围

预览运行真实 WinForms/AppKit 界面，注入模拟的房间和玩家状态。检查文字、排版、控件显隐、按钮和勾选状态；Windows 入口还检查部分控件边界与首显布局。

截图生成成功只代表程序成功渲染并输出图片，不代表界面审查通过。下载后检查目标状态、三语长文案、按钮重叠和文字截断。预览不启动 Steam、Dota 或真实房间，不修改玩家的已保存选择。

保存偏好、真实点击链路和联机规则使用对应行为测试验证。Steam 登录、Dota 冷启动与复用、跨平台联机、真实高 DPI 和长时间运行仍需实机验收。

## 维护

- 现有场景的布局、文案和配色修改，重新运行工作流即可，图片从最新代码渲染。
- 新页面、弹窗或状态，补对应平台的预览场景及范围清单；工作流通常不需要修改。
- 输入参数、构建入口或产物方式改变时，才调整工作流。

Windows 入口为 [test-ui.ps1](../../launcher/test-ui.ps1)及 [ui-preview.cs](../../launcher/tests/ui-preview.cs)，Mac 入口为 [test-ui.sh](../../launcher/macos/test-ui.sh)及 AppKit 的预览状态。缩略总览由共用的 [ui-preview-summary.py](../../launcher/ui-preview-summary.py)生成。

本机也可在构建后运行相同脚本：

```powershell
./launcher/test-ui.ps1 -OutputDirectory <绝对输出目录> -Scope host -Language zh-CN
```

```bash
bash launcher/macos/test-ui.sh <绝对输出目录> host zh-CN
python3 launcher/ui-preview-summary.py <绝对输出目录>
```
