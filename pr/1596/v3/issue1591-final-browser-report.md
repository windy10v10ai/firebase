# PR #1596 最终浏览器验证

服务：http://localhost:3191，本分支默认生产 Turbopack 构建；Playwright Core + 系统 Chrome headless。

## 范围与隔离

- 首轮 Webpack 完整矩阵：375 / 768 / 1024 / 1280 × zh / en / ru，共12档、114状态，证据保存在 issue1591-report.json。
- 最终默认 Turbopack 复验：375 / 1280 × zh / en / ru，共6档、57状态。每档另外用全新匿名 context 打开 wiki/items、wiki/abilities。
- 数据来自固定 issue1591-fixtures.json。同源 /api/player/*、/api/daily-task/*、/api/auth/steam/verify、Firebase identitytoolkit 响应用测试数据拦截；未知 /api/* 直接返回501并记录异常，未调用真实登录或真实后端。
- 用真实点击走 /login/callback 建立合成浏览器身份；profile 匿名访客本来不显示近期战绩，不能用于验证该功能。这是UI验证，不代表后端集成或鉴权安全验证。

## 结果

- 最终6档核心行为均通过：展开战绩、点开黑皇杖/撒旦/中立附魔/失节华冠、兽化盾与六脉神剑；Escape关闭；桌面真实hover；按钮focus；回光返照技能弹窗回归。
- 失节华冠显示独立的死亡退化说明，无金币与抽奖档位；兽化盾价格42200、无游泳被动；六脉神剑无减速抗性；树枝和配方仅弹出名字提示。Wiki未发现已删除法师泳衣图标，兽化盾搜索后价格更新。
- 最终57个页面/弹窗/tooltip布局状态：scrollWidth不大于视口，无可见元素横向越界，header可见交互元素无重叠；console error、pageerror、MISSING_MESSAGE、HTTP >=400 都为0。
- 中文375两wiki弹窗记录到1个不可见登录加速提示元素left=-3.156（opacity0），已单列；不引起横向滚动。
- 7个关键物品图标GET均200，见issue1591-resource-report.json（首轮资源GET结果）。

## 网络包证据（最终6档结果相同）

| 时机 | match说明包 | wiki物品说明包 |
|---|---|---|
| 主页初次加载 | 无 | 无 |
| 展开近期战绩 | 无 | 无 |
| 首次点击失节华冠 | 37e3yvz7x71i-.js | 无 |
| 随后点击兽化盾 | 已有同一份，无重复请求 | 40x1tol3-3hq4.js |
| 新context打开wiki/items | 无 | 40x1tol3-3hq4.js |
| 新context打开wiki/abilities | 无 | 无 |

包身份通过构建chunk内容确定：match包包含英文独立退化说明“ You have died and thus get nothing ”；wiki包包含item_beast_shield详情。最终完整response URL在issue1591-final-report.json。

## 截图与人工复核

最终目录：screenshots/issue1591-v3，共30张。每张均读图核对布局与对齐、文字换行和图标比例；未发现需修复的可见问题。所有最终截图统一等待500ms入场动画结束，旧v1/v2目录不用于PR。英文/俄文兽化盾长说明的底部渐隐和滑动提示属于既有弹窗行为。俄文中的物品名/部分自定义说明使用同步数据的英文回落。

| 截图 | 人工复核 |
|---|---|
| en-beast-1280.png | 布局、换行、图标比例通过 |
| en-beast-375.png | 布局、换行、图标比例通过 |
| en-profile-1280.png | 布局、换行、图标比例通过 |
| en-profile-375.png | 布局、换行、图标比例通过 |
| en-sacred-1280.png | 布局、换行、图标比例通过 |
| en-sacred-375.png | 布局、换行、图标比例通过 |
| en-wiki-abilities-1280.png | 布局、换行、图标比例通过 |
| en-wiki-abilities-375.png | 布局、换行、图标比例通过 |
| en-wiki-items-1280.png | 布局、换行、图标比例通过 |
| en-wiki-items-375.png | 布局、换行、图标比例通过 |
| ru-beast-1280.png | 布局、换行、图标比例通过 |
| ru-beast-375.png | 布局、换行、图标比例通过 |
| ru-profile-1280.png | 布局、换行、图标比例通过 |
| ru-profile-375.png | 布局、换行、图标比例通过 |
| ru-sacred-1280.png | 布局、换行、图标比例通过 |
| ru-sacred-375.png | 布局、换行、图标比例通过 |
| ru-wiki-abilities-1280.png | 布局、换行、图标比例通过 |
| ru-wiki-abilities-375.png | 布局、换行、图标比例通过 |
| ru-wiki-items-1280.png | 布局、换行、图标比例通过 |
| ru-wiki-items-375.png | 布局、换行、图标比例通过 |
| zh-beast-1280.png | 布局、换行、图标比例通过 |
| zh-beast-375.png | 布局、换行、图标比例通过 |
| zh-profile-1280.png | 布局、换行、图标比例通过 |
| zh-profile-375.png | 布局、换行、图标比例通过 |
| zh-sacred-1280.png | 布局、换行、图标比例通过 |
| zh-sacred-375.png | 布局、换行、图标比例通过 |
| zh-wiki-abilities-1280.png | 布局、换行、图标比例通过 |
| zh-wiki-abilities-375.png | 布局、换行、图标比例通过 |
| zh-wiki-items-1280.png | 布局、换行、图标比例通过 |
| zh-wiki-items-375.png | 布局、换行、图标比例通过 |

## 限制

未连接生产结算API/Steam登录；未验证真实移动设备、iOS触摸拖拽、弱网和断网重试。没有修改产品源码或重启服务。