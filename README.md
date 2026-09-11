# assets

PR 正文引用的图片。这是一个**孤儿分支**，与 `develop` / `main` 没有共同祖先，不参与主线的历史，也不出现在任何 diff 里。

目录按 PR 编号分：`pr/<PR 编号>/<名字>.png`

引用方式（仓库是公开的，raw 链接可直接在 Markdown 里渲染）：

```
https://raw.githubusercontent.com/windy10v10ai/firebase/assets/pr/<PR 编号>/<名字>.png
```

截图的生成方式见 `web/CLAUDE.md` 的「PR 截图」。

## 清理策略

**不定期清理，设阈值：本分支超过 20MB 再处理。**

按实测节奏这个阈值大概率不会触发——2026 年前 9 个月里真正改动页面、需要截图的 PR 只有 2 个，按每个 350KB 计约 1MB/年。

触发时的做法是**删掉本分支、另建一个新的**（如 `assets-2027`），不要在本分支上删文件或 force push：

```bash
git push origin --delete assets
```

三个理由：

- **删文件不回收空间。** 提交一个「删掉 pr/xxx」的 commit，旧 blob 仍从历史可达，clone 照样下载
- **force push 重建要一次性让所有老 PR 裂图。** 换新分支只影响被删的那一批，而且 URL 里本来就带分支名
- **删 ref 之后新 clone 立刻不再下载这些对象**，不用等 GitHub 后台 GC。本分支从不参与 PR，没有 `refs/pull/<n>/head` 把对象钉住

代价是被删那批 PR 正文里的图变成裂图，这是拿回空间的必然代价。主线源码历史不受任何影响——图片从来就没进过主线。
