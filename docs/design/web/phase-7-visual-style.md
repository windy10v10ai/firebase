# 批次 7 视觉风格

> 总体规划见 [README.md](README.md)。已完成：[#1165](https://github.com/windy10v10ai/firebase/pull/1165)。

## 一句话结论

**底色保持中性深灰；勇士与会员数据分别使用紫色与金色，标题跟随内容归属，链接使用蓝色，其余文字使用灰白层级；按钮和头部动效遵循本页规格。**

## 1. 已定范围

设计 token、字体、基础组件与头部视觉规则均已落地；后续页面直接按本文的取值和行为规格实现。

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

**勇士与会员数据分别使用紫色与金色。** 链接蓝和状态色不表示归属；会员页的平台订阅按钮是统一紫色主操作的例外，会员标题与价格仍使用金色。

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

### 标题

**标题跟着内容的归属着色**，不是一律白也不是一律金：

| 内容 | 标题色 |
|---|---|
| 会员相关（会员页、会员卡、激活页、订阅平台） | `--color-member-strong` |
| 勇士相关（属性页、觉醒页，以及将来一切花勇士积分的页面） | `--color-season` |
| 其余（首页、战绩、商业披露、通用卡片） | `--color-heading` |

game 里标题一律金（`dialog.less` 的 `.title`、tab 当前项都是 `@color-gold`）。网站不能照搬：金在这里已经等于会员，全站标题变金，金皇冠和金订阅按钮就失去了识别作用。折中成「标题跟内容走」，层级和归属都保住。

标题一律白也不行——那样层级只剩字号一档，卡片一多就分不出主次。

### 链接

| token | 取值 | 用途 |
|---|---|---|
| `--color-link` | `#6aa9e0` | 正文内联链接 |
| `--color-link-hover` | `#8dc2ef` | 内联链接悬停、导航类链接悬停 |

**链接不用紫。** 紫在这里等于勇士积分，紫色的「爱发电」链接会被读成跟积分有关；链接是功能，与归属无关，所以单开一档蓝，既不属于勇士也不属于会员。

两种用法分开：

- **正文内联链接**（`.link-inline`）：静止就是蓝的，否则在整段文字里认不出来可点
- **导航类链接**（`.link-hover`，品牌名、页脚、账号控件）：静止中性，悬停才变蓝。横排导航项仍然是例外，见第 5 节

**赞助平台用各自的品牌色**，只用在平台名和指向该平台的链接上：

| token | 取值 | 平台 |
|---|---|---|
| `--color-afdian` | `#946ce6` | 爱发电 |
| `--color-kofi` | `#29abe0` | Ko-fi |

会员页上两张平台卡并排，标题带品牌色比两个都染成会员金更好认。价格仍是米金；订阅按钮统一使用紫色主操作，平台颜色只保留给平台本身。

两个取值都取自 game 的 `src/panorama/react/hud_main/pages/profile/tabs/member/styles.less`，游戏内用在平台卡描边和平台描述行上，网站改用在平台名和链接上。

Ko-fi 的蓝 `#29abe0` 与链接蓝 `#6aa9e0` 同色系，靠饱和度分开；两者不会出现在同一行。爱发电的紫 `#946ce6` 与勇士紫 `#a874ea` 很接近。会员页上没有勇士内容，撞不到；但品牌色只许出现在这两个平台自己的元素上，别的地方一概不用，否则紫就分不清是积分还是赞助平台了。

### 状态色

| 用途 | 取值 |
|---|---|
| 正向、点赞、治疗 | `#7fd47f` |
| 危险、举报、死亡 | `#e87d7d` |
| 警告 | `#f5a623` |
| 行为分满档 | `#ffd700` |

行为分分段色在战绩组件接入时实现；当前战绩页面使用中性文本。

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
| 爱发电 | `linear-gradient(90deg, #946ce6, #3d2a66)` | `#a98bec` | 同上 |
| Ko-fi | `linear-gradient(90deg, #29abe0, #0d3d52)` | `#5cc3ea` | 同上 |
| 次要 | 透明 | `--color-line` | `--color-content` |
| 禁用 | `--color-panel-soft` | `--color-line` | `#5d5d66` |

尺寸与状态：

| 项 | 值 |
|---|---|
| 高度 | 手机 44px、桌面 40px |
| 圆角 | 7px（36px 的用 6px） |
| 字号 | 14px / 800 字重 |
| 悬停 | `filter: brightness(1.12)` |
| 按下 | `filter: brightness(0.9)` |
| 禁用 | 换成灰底灰字，不要只降透明度——金底降一半仍看得见字，紫底会糊；另配一行小字说明为什么不能点 |

渐变没法进 Tailwind 的 `@theme`，在 `@layer components` 里写成 `.btn-member` / `.btn-season` / `.btn-afdian` / `.btn-kofi` 四个类。

**会员页 `PlatformCard` 的两个订阅按钮统一使用 `.btn-season`。** 平台标题保留品牌色，金色标题和米金价格表示会员归属；个人主页会员卡的「前往订阅」保持 `.btn-member`。

### 对比度

`.btn-member`、`.btn-afdian` 与 `.btn-kofi` 的白字在渐变亮端低于 WCAG AA；为保持游戏内按钮风格继续使用白字。`.btn-season` 白字对比度为 7.2 : 1，会员页的平台订阅按钮使用这一变体。

## 5. 头部

结构与尺寸照搬 [phase-2g-header-layout.md](phase-2g-header-layout.md)，这一批只改下面这些。

![头部](images/header.png)

### 悬停与当前页

取值照搬 game 的 `src/panorama/react/shared/styles/tab-navigation.less`：悬停只动亮度不动色相，时长 `@transition-fast` 0.15s、`ease-out`。

| 元素 | 静止 | 悬停 | 当前页 |
|---|---|---|---|
| 横排导航项 | `--color-content` | 文字 `--color-heading`；下条 `--color-season-strong` 从 `translateY(4px)` 滑到 0、透明度 0 → 0.55 | 文字 `--color-heading`；下条不透明、`translateY(0)` |
| 菜单行 | `--color-content` | 底 `--color-panel-soft`、文字 `--color-heading` | 同悬停，再加左侧 2px `--color-season-strong` 竖条 |
| 汉堡按钮 | `--color-panel-soft` | `--color-control-hover` | 不标当前页 |

三条跟着来的规则：

- **当前页悬停无变化。** 它已经是终点，点了还在这一页。game 里 active 与 hover 用同一个底色 `#ffffff11`，就是这个意思——当前页 = 常驻的悬停态。
- **横排导航项是 `link-hover` 的例外**：悬停提亮到 `--color-heading`，不变紫。紫在那一行已经归当前页的下条用了，悬停再变紫，相邻两项一个白字紫条、一个紫字，扫一眼分不清哪个是当前页。品牌名、菜单行悬停变链接蓝，正文内联链接静止就是蓝的，见第 2 节。
- **汉堡按钮不标当前页**：它是「打开菜单」的开关，不是导航项；窄屏下它是唯一入口，永远高亮等于永远不高亮。
- `prefers-reduced-motion: reduce` 下把上面所有过渡时长归零。

**窄屏的位置提示只在菜单里。** 下条长在横排上，而窄屏把横排整体收起来了。收起时不补页面名——375 那一行量下来只剩 13px 余量，塞不下；手机上页面标题本来就在头部正下方第一行。

### 菜单图标

![菜单图标](images/header-menu.png)

四个站内项配齐，全部取自已装好的 `lucide-react`，图标名即 import 名。

| 项 | 图标 | 颜色 |
|---|---|---|
| 属性加点 | `CirclePlus` | `--color-content` |
| 英雄觉醒 | `Sparkles` | `--color-content` |
| 会员订阅 | `Crown` | `--color-member-strong` |
| 技能与物品 | `BookOpen` | `--color-content` |
| Steam 创意工坊 / GitHub | 已有的 `SteamIcon` / `GithubIcon` | `--color-content` |

一律 19px、`stroke-width` 1.6–1.7。**只有皇冠带色**——图标是让人扫一眼认出哪一行的，四个都上色反而找不到东西。桌面横排不加图标，2g 定了横排只放最短文案。

这一条把 2g 第 6 条的「站内项左侧留等宽缩进」从留白换成了图标本身。缩进宽度、对齐结果都不变，2g 的意图（站内外对齐）也不变。

### 不做的

- **登录按钮保持中性灰**，不做成紫色或金色主按钮。紫和金是货币色，Steam 登录入口染上任何一种都会被读成「跟积分有关」；它靠 36px 高度和最右位置已经够显眼。
- **不引任何组件库。** 上面整节加起来十来行 CSS。头部刚在 #1161 重做完，这一批的范围是「不重构组件」。
- **横排的滑动指示器不做**（方案D4），桌面横排现在只有「会员」一项可见。

## 6. 其余组件

| 组件 | 规格 |
|---|---|
| 卡片 | `--color-panel` 底 + 1px `--color-line` 描边 + 10px 圆角 + 18px/20px 内边距；去掉现在的 `backdrop-blur` 和 hover 位移 |
| 嵌入块 | `--color-panel-soft` 底 + 7px 圆角；属于某套货币时左边加 2px 对应色条 |
| 进度条 | 高 6px、圆角 3px，槽 `--color-panel-soft`，填充用货币色的 strong 档 |
| 数据行 | 标签 `--color-muted` 左对齐，数值右对齐；概览数值使用粗体 |

## 7. 后续约束

后续批次按以下业务规则实现：

- **属性加点花的是属性点**，属性点 = 勇士等级 + 会员等级（接口的 `totalLevel`），可用属性点是 `useableLevel`。洗点才消耗会员积分。
- **可用积分用于永久觉醒英雄**，会员积分还能刷新抽奖。觉醒一个英雄要勇士积分 8000 或会员积分 4000。
- **累计积分只增不减**，决定等级与属性点；花费只减可用。这两句的文案直接用游戏的 `profile_point_season_tooltip` 与 `profile_point_member_tooltip`，不要另写。
- **会员状态**：`member.level` 为 1 显示「普通会员」，≥2 显示「高级会员」；没有 `member` 时显示未订阅状态与会员页入口。

## 8. 后续事项

- 头像等批次 9 拿到 Steam Web API key 后替换占位图标；会员状态不额外加金边。
- 觉醒页确定数据请求后，再决定是否在入口显示已觉醒数量。
- Tooltip 采用成熟组件库实现，需覆盖视口避让、触屏、键盘焦点与滚动跟随。
- 批次 3a 开工前决定是否引入 shadcn/ui，为属性、觉醒与技能物品页统一 Tabs、Dialog、Select、Progress、Tooltip。
