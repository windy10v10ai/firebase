---
name: impeccable
description: 对网站或启动器的界面做设计点评、技术检查、打磨或改版时加载——「这页哪里不好看」「打磨一下」「改版」「换配色」「排版 / 字体 / 文案不舒服」「查一下无障碍和手机适配」。修 bug、同步游戏数据、改接口这类不动外观的工作不加载。
---

# impeccable（精简版）

界面设计方法：先按页面性质定模式，再照对应命令的说明文件做点评、检查或修改。本目录是上游 impeccable 技能的精简副本，只带下表的命令，来源与许可见 [NOTICE.md](NOTICE.md)。

## 准备

1. **读本仓库的设计依据**，它们替代上游说明里的 `PRODUCT.md` / `DESIGN.md`：
   - 产品与玩家：[docs/web/README.md](../../../docs/web/README.md)、[launcher/README.md](../../../launcher/README.md)，用语见根目录 `CLAUDE.md`「用语」
   - 视觉规范：[docs/web/design-system.md](../../../docs/web/design-system.md)；取值的真相源是 `web/app/globals.css` 的 `@theme`
   - 写代码的约束：`web/CLAUDE.md`、`launcher/CLAUDE.md`

   不新建 `PRODUCT.md`、`DESIGN.md`。上游说明要求写入或更新 `DESIGN.md` 时，加载 design-docs 技能，改 `docs/web/design-system.md`。
2. **读请求对应的命令文件**（下表）；改任何界面之前再读 [reference/craft-floor.md](reference/craft-floor.md)。
3. **检查程序与钩子没有安装**：说明里运行 `scripts/impeccable` 的步骤（`context`、`detect`、`critique-storage`、`live-server`、`pin`、`hooks` 等）一律跳过，改为读代码判断，渲染效果用 web-browser-verify 截图看。说明里链到本目录没有的文件（`live.md`、`ios.md`、`android.md`、`*.native.md`、`init.md`、`shape.md` 等）同样跳过。

完成条件：动手前已读过上面三类设计依据和对应命令文件。

## 本仓库优先

- **与 `web/CLAUDE.md`、`design-system.md` 冲突时以仓库为准。**认为仓库规范本身该改，先向用户提出，拍板后先改规范再改代码，不在代码里悄悄偏离
- **文案、断点、内边距、按钮选型照 `web/CLAUDE.md`**，界面文案中、英、俄三份一起改
- **验证与截图**：网站走 web-browser-verify 与 `web/CLAUDE.md`「PR 截图」；启动器走 `launcher/CLAUDE.md`「PR 截图」
- **启动器是 WinForms**：说明里针对 HTML / CSS 的检查不适用，只用点评、层级、文案这些原则

## 模式

模式按页面定，不按产品定。

| 模式 | 玩家来做什么 | 本站页面 | 读 |
|---|---|---|---|
| 宣传 | 决定并行动 | 首页、`/launch`、会员页的购买引导 | [mode-persuade.md](reference/mode-persuade.md) |
| 操作 | 完成一件事 | 个人主页、加点、觉醒、每日任务、排行榜、启动器窗口 | [mode-operate.md](reference/mode-operate.md)、[operate.md](reference/operate.md) |
| 阅读 | 看懂一件事 | 百科、法律页、更新日志 | [mode-read.md](reference/mode-read.md) |

宣传页可以大胆、有鲜明风格；操作与阅读页的讲究体现在克制、一致、好扫读。

## 原则

- **打磨保留原样，改版整体替换。**打磨不动既有的配色、文案、行为和范围外的东西；改版把旧样子当反例，按 [new-work.md](reference/new-work.md) 定新方向，不在旧样子上半改半留
- **先看渲染结果再下结论**，问题攒一批一起改，改完再看一次，不每改一处截一次图

## 命令

| 命令 | 做什么 | 说明文件 |
|---|---|---|
| `critique` | 设计点评：层级、清晰度、观感，按严重程度列问题 | [critique.md](reference/critique.md) |
| `audit` | 技术检查：无障碍、性能、主题 token、手机适配，只出报告 | [audit.md](reference/audit.md) |
| `polish` | 上线前的收尾打磨，对齐设计规范 | [polish.md](reference/polish.md) |
| `typeset` | 字体、字号与层级 | [typeset.md](reference/typeset.md) |
| `layout` | 间距、节奏与排版结构 | [layout.md](reference/layout.md) |
| `colorize` | 用色策略 | [colorize.md](reference/colorize.md) |
| `clarify` | 界面文案、标签与报错 | [clarify.md](reference/clarify.md) |
| `harden` | 边界情况：报错、空状态、长文案溢出、多语言 | [harden.md](reference/harden.md) |
| `adapt` | 不同屏幕宽度与设备 | [adapt.md](reference/adapt.md) |
| 改版 | 定新的视觉方向 | [new-work.md](reference/new-work.md) |

用户只输入 `/impeccable` 没带参数时，列出此表让用户选，不自动执行；请求同时对得上两个命令时问一次。
