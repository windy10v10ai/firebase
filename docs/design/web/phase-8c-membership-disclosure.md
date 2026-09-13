# 批次 8c：会员页与商业披露

> 状态：进行中。总体规划见 [README.md](README.md)。

## 一句话结论

**会员页保留既有排版，爱发电与 Ko-fi 的订阅按钮统一使用紫色主按钮；商业披露使用普通内容卡片，披露项目在手机端显示标签—内容列表、平板及桌面保留表格。**

## 页面与组件

- 会员页的平台标题继续使用品牌色，价格继续使用会员金色；仅两个 `PlatformCard` 订阅按钮使用 `.btn-season`。
- 商业披露标题使用 `--color-heading`，说明与更新时间使用正文和次要文字 token。
- `DataTable` 使用 `--color-panel` 与 `--color-panel-soft` 区分行层级；375 宽度渲染语义化卡片列表，768 与 1280 宽度渲染表格。
- `Section` 已提供当前页面所需的宽度能力，不增加新的 props。
- 语言切换分隔符、手动激活结果图标改用对应设计 token。

## 文档同步

- [phase-7-visual-style.md](phase-7-visual-style.md) 记录会员页紫色订阅按钮这一例外，并删除已完成批次的施工过程与失效约束。
- [README.md](README.md) 更新 8a、8b、8c 进度，删去已完成任务的并行安排，并记录本批的文档对齐工作。
- [phase-8a-home-page.md](phase-8a-home-page.md) 只保留已上线首页的当前行为与后续依赖。

## 验收

- `cd web && npm run lint && npx tsc --noEmit && npm run build`
- 使用 Playwright 在 375、768、1280 宽度验证会员页与商业披露：无横向滚动、无元素越界、无 console 错误。
- 以 `develop` 为基线，为两个页面分别保留 375 与 1280 宽度的前后截图。
