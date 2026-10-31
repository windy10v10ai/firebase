---
name: issue-impl
description: 按 issue 末尾的「执行说明」实现一条 issue：实现、验收、运行验证、开 PR。用户说「做 #123」「实现这个 issue」时用，issue-autorun 派执行者时也让执行者照它做。
---

# issue-impl

把一条已有「执行说明」的 issue 做到 PR。标签与执行说明格式见 `.claude/references/agent-issue.md`，开始前先读。没有 `## 执行说明` 的 issue 不做：用户在场先用 `issue-spec` 补，批量模式记为 `agent-block`。

## 硬规则

- 只改执行说明「改动范围」里的文件；范围外的需求（评论里的新想法、相关 bug）不做，记进 PR「等你处理」的「发现」
- 不改 issue 正文，只留言、改标签
- 不合并、不推 `develop` / `main`，PR 先开草稿
- 不用降低标准换通过：改测试迁就代码、删失败用例、把没达成写成完成都不行
- 没亲眼看到的结果不写进 PR
- 执行者不自己跑 `npm install` / `npm ci`，依赖由调度员保证已装好

## 卡住时怎么办

| 情况 | 做法 | 记成 |
|---|---|---|
| 有合理的默认做法（项目规则、相邻代码的惯例） | 按默认做 | **请确认**：按什么默认做了、改成别的要动哪里 |
| 没有默认，但这一处不影响其他部分 | 跳过这一处，继续做其余部分，代码里不留半成品 | **待你决定**：缺什么信息、有哪几种选法 |
| 影响整条 issue，什么都做不了 | 放弃这条 issue | 写进 issue 留言，打 `agent-block`（批量模式） |

机械性失败（lint、格式、类型）自己修；测试失败可以改实现重跑，最多三轮，**不许改预期值与断言**。三轮仍不过，撤回那部分改动并记为「待你决定」。

## 步骤

1. **开工前**：`git status --porcelain` 必须为空，`git switch develop && git pull --ff-only`，再切 `feature/<issue-id>-<3–6 个英文小写单词>`（Bug 用 `fix/`）。开工把 issue 在「开发计划」项目里的 Status 置为 In progress
2. **先读**：根 `.claude/CLAUDE.md`、改动目录的 `CLAUDE.md`、执行说明「做法」指定的 skill
3. **实现**：按「做法」做，范围外的不碰
4. **验收**：跑执行说明「验收」里的命令并补测试；`git diff --name-only origin/develop...HEAD` 只含改动范围内的文件；改了注释的，按根 `CLAUDE.md`「注释规约」自查
5. **运行验证**（按层级做）：按执行说明起 emulator 或 API，临时脚本每项打印 `[check] PASS|FAIL <名字> actual=<值> expected=<值>`，预期值照执行说明抄，脚本放 scratchpad 不提交，`FAIL` 为 0 才算过。执行说明标了「截图判定」的，按 `web-browser-verify` 与 `web/CLAUDE.md`「PR 截图」拍图放进 PR，只交图和状态，不写「通过 / 失效」；「用户判定」的不做，列进「等你处理」
6. **提交与 PR**：commit 英文单行标题；`git push -u origin HEAD`；按根 `CLAUDE.md`「PR 正文」写，先 `gh pr create --draft --base develop`。目标全部完成写 `Fixes #<id>`，有跳过写 `Part of #<id>`。正文加「等你处理」三组（请确认 / 待你决定 / 发现），都空写「无」
7. **审一次**：对照执行说明逐条核对 PR，没问题 `gh pr ready <编号>`（CI 过了才算完成）；有「待你决定」跳过的部分，或要用户拍板才能继续的，保持草稿并说明原因
8. **收尾**：停在 PR 分支，`git status --porcelain` 为空；回报 PR 链接、每条验收命令的结果、运行验证每项结论、「等你处理」各条
