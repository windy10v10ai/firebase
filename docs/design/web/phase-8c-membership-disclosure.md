# 批次 8c：会员页与商业披露

> 已完成：[#1170](https://github.com/windy10v10ai/firebase/pull/1170)。总体规划见 [README.md](README.md)。

## 一句话结论

**会员页保留既有排版，爱发电与 Ko-fi 的订阅按钮统一使用紫色主按钮（例外记录见 [phase-7-visual-style.md](phase-7-visual-style.md)）；商业披露使用普通内容卡片，披露项目在手机端显示标签—内容列表、平板及桌面保留表格。**

## DataTable

窄屏（<640px）渲染标签—内容卡片列表，768 及以上渲染表格；行层级用 `--color-panel` 与 `--color-panel-soft` 区分。
