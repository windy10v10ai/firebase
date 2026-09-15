# 网站批次设计

> 网站重做按批次推进，本目录记录各批次的具体设计和进度。长期有效的架构、鉴权、页面与菜单、技术方向见 [docs/web/README.md](../../web/README.md)，只在决策变更时更新，不重复本目录内容。
>
> 已完成的批次只留结论，做法去对应 PR 里看；瘦身规则见 [design-docs](../../../.claude/skills/design-docs/SKILL.md) 技能。

## 分批计划

按执行顺序排列：

| 批次 | 跟踪 issue | 内容 | 状态 |
|------|------|------|------|
| 0 API 访问路径 | #1114 | 浏览器直连 API，定 CORS 白名单 | 已完成 |
| 1 新框架迁移 | #1117 | 清残留与移动端修复、Next 16、Tailwind 4 + 设计 token、去 antd、React 19 | 已完成 |
| 2 Steam 登录 | #1118 | 后端 `auth` 模块与 guard、网站登录跳转与回调、`/my/*` 门禁、个人主页、激活页自动填 ID | 已完成 |
| 3ab-api 开放属性与觉醒接口 | #1163 | 给已有的加点、洗点、觉醒、随机四个接口挂 `@AllowWeb()` | 已完成 |
| 2g 顶部布局 | #1161 | 头部结构重做：站内外分组、两端同一套菜单、控件尺寸统一，见 [phase-2g-header-layout.md](phase-2g-header-layout.md) | 已完成 |
| 7 视觉风格 | #1165 | 改 token 取值、字体，打磨基础组件，见 [phase-7-visual-style.md](phase-7-visual-style.md) | 已完成 |
| 3a 属性页 | #1119 | `/profile/<steamId>/property`：查看、加点、重置，见 [phase-3a-property-page.md](phase-3a-property-page.md) | 已完成 |
| 3a-2 宽屏与属性卡 | 无 | 全站外框 1280 封顶；属性页三列，属性卡进度条逐级取色、升级按钮分档，见 [phase-3a-property-page.md](phase-3a-property-page.md) | 已完成 |
| 3b 觉醒页 | #1120 | `/profile/<steamId>/awaken`：已觉醒列表、解锁、随机，外加从 game 同步觉醒数据的脚本与 skill，见 [phase-3b-awaken-page.md](phase-3b-awaken-page.md) | 已完成 |
| 3b-2 觉醒技能提示框 | 无 | 觉醒卡悬停弹出 Dota 式技能提示，详情弹窗补上数值与冷却耗蓝，「已觉醒」标记与弹窗文案调整，见 [phase-3b-2-ability-tooltip.md](phase-3b-2-ability-tooltip.md) | 已完成 |
| 3b-3 觉醒详情弹窗与随机卡 | 无 | 手机贴底抽屉可下拉关闭、平板起统一高度；说明放不下时直接滚动、触屏在渐隐里提示可以滑；关闭挪到右上角；随机半价划掉原价，随机卡换立绘拼贴底并加「-50%」标签，见 [phase-3b-3-awaken-dialog.md](phase-3b-3-awaken-dialog.md) | 已完成 |
| 4 游戏联动 | windy10v10ai/game#2411 | game 仓库：「前往网站」按钮、刷新按钮、FAQ | 已完成 |
| 8a 首页 | #1168 | 登录引导与主要页面导航 | 已完成 |
| 8b 个人主页 | #1167 | 身份卡与战绩卡按勇士紫 / 会员金上色，宽屏分栏 | 已完成 |
| 8c 会员页与商业披露 | #1170 | 会员页订阅按钮统一紫色；披露页、数据表与文档收尾 | 已完成 |
| 9 Steam 昵称头像 | 无 | 后端加 `steam-profile` 接口与 Firestore 缓存，头部账号区与身份卡显示昵称头像，见 [phase-9-steam-profile.md](phase-9-steam-profile.md) | 已完成 |
| 10 首屏与加载态 | #1176 | 首屏按 cookie 定登录形态，加载中改为原位骨架块，全站断点统一为手机 / 平板 / 电脑三档，见 [phase-10-first-paint.md](phase-10-first-paint.md) | 已完成 |
| 11 可点击元素与玩家页细节 | 无 | 按钮手型光标、属性页等级入口加箭头、个人主页会员状态并入身份卡，见 [phase-11-clickable-polish.md](phase-11-clickable-polish.md) | 已完成 |
| 12 配色与控件 | 无 | 网站主色、功能色、品牌色与按钮体系，最终规范见 [docs/web/design-system.md](../../web/design-system.md)；取舍过程见 [phase-12-color-system.md](phase-12-color-system.md)、[phase-12-controls.md](phase-12-controls.md)（含登录等待、头部退出） | 已完成 |
| 5 GA4 | #1122 | 网站接入 GA4 | 未开始 |
| 6 会员剩余 | #1123 | 积分、支付宝二维码购买；连带把支付宝、爱发电、Ko-fi 的回调地址改到 `api.windy10v10ai.com`，见 [api-entry](../api-entry/README.md) | 未开始 |

### 后续依赖

剩下的 **5 GA4** 与 **6 会员剩余**互不阻塞，也不依赖别的批次，随时可以插队。

`/wiki/*` 的技能与物品页仍未排期，菜单项靠 `config/nav.ts` 里 `href` 为 `null` 隐藏着。

### 子文档写什么

每份子文档在开工前写，内容限于该批次：

- 目标与验收标准
- 涉及的接口与鉴权改动（新增路由、装饰器、白名单）
- 页面与组件清单
- 测试清单（unit / e2e / 线上验证）
- 该批次内需要拍板的技术选择

批次上线后要瘦身，标准见 [design-docs](../../../.claude/skills/design-docs/SKILL.md) 技能：验收标准、测试清单等过程记录直接删除；只留读代码看不出来的部分——设计意图、权衡过程、拍板的决定、至今仍然生效的约束。涉及架构、鉴权等长期有效的决策改变时，同步更新 [docs/web/README.md](../../web/README.md)，不要只改这里。
