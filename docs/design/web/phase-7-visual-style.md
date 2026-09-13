# 批次 7 视觉风格

> 总体规划见 [README.md](README.md)。这一批是三批页面（属性、觉醒、页面布局）的前置瓶颈，范围必须收住。

## 一句话结论

**底色保持中性深灰，颜色只用来分辨两套货币——勇士紫、会员金，其余一律灰白；按钮照搬游戏内的渐变与白字；只改 `globals.css` 的 token 取值、字体和基础组件样式，不重构组件。**

## 1. 范围

做这些：

- `web/app/globals.css` 的 `@theme` token 取值与新增
- 字体
- `web/app/components/ui/` 下已有的 Button、Input、Field、Spinner，以及 `card-container` 等几个工具类的样式
- 新增按钮变体（会员金、勇士紫）与 tooltip、进度条两个小组件

不做这些：

- 不重构任何组件的结构与 props
- 不调整现有页面的排版（首页、会员页的排版是批次 8）
- 不新增页面

**个人主页的结构重排不在这一批。** 设计过程中把个人主页重新排了（左栏玩家卡、积分与等级卡、可点入口行、战绩分两层），那是页面结构改动，按 README 的划分属于批次 8。这一批只把颜色和按钮换掉，个人主页保持现有的三张卡片不动。下面的截图是重排之后的完整形态，作为批次 8 的输入。

## 2. 颜色

### 底色与文字

| token | 取值 | 用途 |
|---|---|---|
| `--color-surface` | `#09090b` | 页面底色 |
| `--color-panel` | `#0f0f11` | 卡片、头部 |
| `--color-panel-soft` | `#17171a` | 卡片内的嵌入块（数值块、tag、输入框底） |
| `--color-line` | `#27272a` | 描边与分隔线 |
| `--color-heading` | `#fafafa` | 标题、主数值 |
| `--color-content` | `#d4d4d8` | 正文 |
| `--color-muted` | `#8b8b93` | 标签、说明、次要信息 |

`--color-panel-soft` 是新增的。现有的 `--color-control` / `--color-control-hover` 取值改成 `#17171a` / `#1f1f23`，名字不动。

### 勇士与会员

**颜色只干一件事：分辨两套货币。** 勇士（等级、积分、进度条、相关入口）一律紫，会员（等级、积分、皇冠、订阅、头像徽章）一律金，其余全是灰白。新增页面照这条判，不要再引入第三种强调色。

| token | 取值 | 用途 |
|---|---|---|
| `--color-season` | `#a874ea` | 勇士的数值与文字 |
| `--color-season-strong` | `#9b5de0` | 勇士的进度条、填充、左侧色条 |
| `--color-season-soft` | `rgba(155, 93, 224, 0.12)` | 勇士图标底、导航高亮底 |
| `--color-season-border` | `rgba(155, 93, 224, 0.4)` | 勇士图标描边 |
| `--color-member` | `#e0caa5` | 会员的数值 |
| `--color-member-strong` | `#daa520` | 会员的标题、皇冠、进度条、描边 |
| `--color-member-soft` | `rgba(218, 165, 32, 0.11)` | 会员图标底 |
| `--color-member-border` | `rgba(218, 165, 32, 0.4)` | 会员图标描边 |

紫的两档取自游戏内 season point 的 `#9b5de0`，文字档提亮到 `#a874ea` 才够对比度；金的两档就是游戏的 `@color-gold` 与 `@color-gold-muted`。

现有的 `--color-accent` 系列保留名字，取值指向勇士紫，这样已经写了 `text-accent` 的组件不用改：

| token | 取值 |
|---|---|
| `--color-accent` | `#a874ea` |
| `--color-accent-hover` | `#bda0f0` |
| `--color-accent-solid` | `#4f48b2` |
| `--color-accent-solid-hover` | `#5f57c8` |

### 状态色

| 用途 | 取值 |
|---|---|
| 正向、点赞、治疗 | `#7fd47f` |
| 危险、举报、死亡 | `#e87d7d` |
| 警告 | `#f5a623` |
| 行为分满档 | `#ffd700` |

行为分按游戏内的分段着色，取值与 `StatsTab.tsx` 一致：≥110 金、80–109 绿、60–79 橙、<60 红。

## 3. 字体

正文 `'Noto Sans SC', system-ui, sans-serif`，字重只加载 400 / 500 / 700。数字一律加 `font-variant-numeric: tabular-nums`，否则等宽对不齐，积分和战绩会跳。

两处与 README 的原计划不同：

- **去掉 Inter。** 中文本来就落到系统字体，留着它只多一次请求。
- **不加衬线标题字。** README 原写「Noto Sans SC 加一个衬线标题字体」，实际做下来层级靠字号和颜色已经分得开；中文衬线（Noto Serif SC）体积大，气质也不像游戏界面。

Noto Sans SC 全量很大，用 `next/font` 按子集加载，`display: swap`。

## 4. 按钮

两种颜色，都照搬游戏内 `src/panorama/react/shared/styles/buttons.less` 的取值，白字加一层黑影。

| 变体 | 底 | 描边 | 字 |
|---|---|---|---|
| 会员（金） | `linear-gradient(90deg, #ca9b3c, #a87820)` | `#daa520` | `#ffffff` + `text-shadow: 0 1px 4px rgba(0,0,0,0.53)` |
| 勇士（紫） | `linear-gradient(90deg, #4f48b2, #0f033a)` | `#7a6fd0` | 同上 |
| 次要 | 透明 | `--color-line` | `--color-content` |
| 禁用 | `--color-panel-soft` | `--color-line` | `#5d5d66` |

尺寸与状态：

| 项 | 值 |
|---|---|
| 高度 | 手机 44px、桌面 40px、卡片内次要动作 36px |
| 圆角 | 7px（36px 的用 6px） |
| 字号 | 14px / 800 字重 |
| 悬停 | `filter: brightness(1.12)` |
| 按下 | `filter: brightness(0.9)` |
| 禁用 | 换成灰底灰字，不要只降透明度——金底降一半仍看得见字，紫底会糊；另配一行小字说明为什么不能点 |

渐变没法进 Tailwind 的 `@theme`，在 `@layer components` 里写成 `.btn-member` / `.btn-season` 两个类。

### 对比度：一处明知不达标的取舍

金色按钮的白字对比度是 **2.5–3.9 : 1**，低于 WCAG AA 对 14px 粗体要求的 4.5 : 1。深色字能到 6.8–9.4 : 1，但那样金按钮用深字、紫按钮用白字，两个按钮不一致。

**决定：接受不达标，两个按钮都用白字，与游戏内保持一致。** 记在这里是为了将来有人提无障碍问题时知道这是权衡结果而不是疏忽。实际影响是订阅按钮在手机字号和强光下会发虚，而它是全站唯一的付费入口——如果以后收到反馈，第一个要改的就是它，改法是把字换成 `#17110a`。

紫色按钮没有这个问题：紫本身够暗，白字是 7.2 : 1，合格。

## 5. 其余组件

| 组件 | 规格 |
|---|---|
| 卡片 | `--color-panel` 底 + 1px `--color-line` 描边 + 10px 圆角 + 18px/20px 内边距；去掉现在的 `backdrop-blur` 和 hover 位移 |
| 嵌入块 | `--color-panel-soft` 底 + 7px 圆角；属于某套货币时左边加 2px 对应色条 |
| 进度条 | 高 6px、圆角 3px，槽 `--color-panel-soft`，填充用货币色的 strong 档 |
| 数据行 | 标签 `--color-muted` 左对齐，数值 700 字重右对齐，行间 1px `--color-line` |
| tooltip | `#1c1c20` 底 + 1px `#3a3a40` 描边 + 8px 圆角 + 12.5px/1.65 行高，最宽 340px |
| 导航高亮 | 当前页用 `--color-season-soft` 底 + `--color-season` 字 + 6px 圆角 |
| 可点入口行 | 整行卡片，左图标、中标题与说明、右数量 tag 和箭头；箭头用 `--color-season` |

## 6. 应用效果

结构是批次 8 的形态，颜色和按钮是这一批的产出。

### 个人主页（桌面）

![个人主页桌面](images/profile-desktop.png)

### 个人主页（手机 390 宽）

![个人主页手机](images/profile-mobile.png)

### 按钮

![按钮](images/buttons.png)

设计过程与被否掉的六个方向留在画布里：<https://claude.ai/code/artifact/1bf27965-f2fa-4091-9fba-191331419108>（需要登录 claude.ai 且在组织内才能打开，所以规格以本文为准，链接只当过程记录）。

## 7. 这一批之外的几条结论

设计过程中确认的，做后面几批时要按这个写，不要写反：

- **属性加点花的是属性点**，属性点 = 勇士等级 + 会员等级（接口的 `totalLevel`），可用属性点是 `useableLevel`。洗点才消耗会员积分。
- **可用积分用于永久觉醒英雄**，会员积分还能刷新抽奖。觉醒一个英雄要勇士积分 8000 或会员积分 4000。
- **累计积分只增不减**，决定等级与属性点；花费只减可用。这两句的文案直接用游戏的 `profile_point_season_tooltip` 与 `profile_point_member_tooltip`，不要另写。
- **累计积分和等级进度的字段接口已经在返**：`seasonPointTotal`、`memberPointTotal`、`seasonCurrrentLevelPoint`（后端原拼写，三个 r）、`seasonNextLevelPoint`、`totalLevel`、`useableLevel`，只是 `web/app/lib/player-info.ts` 的类型没声明，加上即可，后端不用改。
- **会员状态**：`member.level` 为 1 显示「普通会员」，≥2 显示「高级会员」；没有 `member` 字段时整张卡不渲染，订阅入口走顶部菜单；订阅按钮一律指向高级会员。
- **积分最多考虑 7 位数**，数值容器要 `white-space: nowrap`，不能靠换行兜底。

## 8. 测试清单

- [ ] `cd web && npm run lint && npx tsc --noEmit && npm run build`
- [ ] 按 [web/CLAUDE.md](../../../web/CLAUDE.md) 的三档宽度（375 / 768 / 1280）逐页看首页、会员页、个人主页、激活页，确认无横向滚动、头部元素不接触
- [ ] 正文与标签的对比度实测 ≥ 4.5 : 1；按钮对比度记录实测值，金色按钮的偏低是已知取舍
- [ ] 改动前后的截图对比进 PR 正文

## 9. 待办

- 头像要等批次 9 拿到 Steam Web API key，现在是占位图标，不加会员金边（游戏里加金边是为了区分会员，网站不需要）。
- 觉醒入口右边的「已觉醒 12」要多带一个 `include=heroAwakening`，多读一次 Firestore。做觉醒页时一并决定要不要。
