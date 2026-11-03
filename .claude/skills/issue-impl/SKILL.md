---
name: issue-impl
description: 按 issue 正文（背景、目标、要求、验收）和「执行说明」artifact 实现一条 issue：实现、验收、运行验证、开 PR、合入 develop。用户说「做 #123」「实现这个 issue」时用，issue-autorun 派执行者时也让执行者照它做。
---

# issue-impl

把一条正文已按结构写好的 issue 做到合入 `develop`。标签与正文结构见 `.claude/references/agent-issue.md`，开始前先读。正文末尾没有执行说明链接（也找不到名为「执行说明」的 artifact）、或读不到的 issue 不做：用户在场先用 `issue-spec` 补，批量模式记为 `agent-block`。

## 硬规则

- 只改执行说明「改动范围」里的文件；范围外的需求（评论里的新想法）不做；顺手发现的旧问题按 `agent-issue.md`「顺手发现的问题」处理
- 不改 issue 正文，只留言、改标签
- 不直接推 `develop` / `main`，不审批、不合并 Release PR。功能 PR 只在第 9 步合并，执行者不合并。PR 草稿规则见根 `CLAUDE.md`「PR 正文」：做完就开正式，有没做完的部分才开草稿
- 不用降低标准换通过：改测试迁就代码、删失败用例、把没达成写成完成都不行
- 没亲眼看到的结果不写进 PR
- 执行者不自己跑 `npm install` / `npm ci`，依赖由调度员保证已装好

## 卡住时怎么办

| 情况 | 做法 | 记成 |
|---|---|---|
| 有合理的默认做法（项目规则、相邻代码的惯例） | 按默认做，不问 | 用户看得到、可能想改的记**发版前**：按什么默认做了、改成别的要动哪里；其余 PR 正文写一句 |
| 没有默认，但这一处不影响其他部分 | 跳过这一处，继续做其余部分，代码里不留半成品 | **待你决定**（挡合并）：缺什么信息、有哪几种选法 |
| 影响整条 issue，什么都做不了 | 放弃这条 issue | 写进 issue 留言，打 `agent-block`（批量模式） |

机械性失败（lint、格式、类型）自己修；测试失败可以改实现重跑，最多三轮，**不许改预期值与断言**。三轮仍不过，撤回那部分改动并记为「待你决定」。

## 步骤

1. **开工前**：`git status --porcelain` 必须为空，`git switch develop && git pull --ff-only`，再看这条 issue 有没有关联的未合并 PR（`gh issue view <issue-id> -R windy10v10ai/firebase --json closedByPullRequestsReferences`，草稿也算）：有就接着做，`git fetch origin && git switch -C <该 PR 的分支> origin/<该 PR 的分支>`，不另切分支、不另开 PR；没有才切 `feature/<issue-id>-<3–6 个英文小写单词>`（Bug 用 `fix/`）。开工把 issue 在「开发计划」项目里的 Status 置为 In progress
2. **先读**：根 `.claude/CLAUDE.md`、改动目录的 `CLAUDE.md`、执行说明「做法」指定的 skill
3. **实现**：按「做法」做，范围外的不碰
4. **验收**：跑执行说明「验收命令」里的命令并补测试，并逐条核对「验收」一节；`git diff --name-only origin/develop...HEAD` 只含改动范围内的文件和带着修的小改动；改了注释的，按根 `CLAUDE.md`「注释规约」自查
5. **运行验证**（按层级做）：按执行说明起 emulator 或 API，临时脚本每项打印 `[check] PASS|FAIL <名字> actual=<值> expected=<值>`，预期值照执行说明抄，脚本放 scratchpad 不提交，`FAIL` 为 0 才算过。执行说明标了「截图判定」的，按 `web-browser-verify` 与 `web/CLAUDE.md`「PR 截图」拍图放进 PR，只交图和状态，不写「通过 / 失效」；「用户判定」的不做，列进「等你处理」的「发版前」
6. **提交与 PR**：commit 英文单行标题；`git push -u origin HEAD`；按根 `CLAUDE.md`「PR 正文」写，`gh pr create --base develop`（有没做完的部分才加 `--draft`）。目标全部完成写 `Fixes #<id>`，有跳过写 `Part of #<id>`。正文加「等你处理」两组：「待你决定」（挡合并）、「发版前」（合并后写进 Release PR，写法见 `agent-issue.md`「写进 Release PR」），都空写「无」；按默认做的取舍、顺手改动、不严重的发现各写一句，放在「等你处理」之前
7. **审一次**：单条模式派审查子代理（写代码的是主对话），批量模式由调度员审。对照执行说明逐条核对 PR，没问题就保持正式（原先是草稿的 `gh pr ready <编号>`，CI 过了才算完成）；审出要大改的 `gh pr ready <编号> --undo` 退回草稿，改完再转正式；有「待你决定」跳过的部分，或要用户拍板才能继续的，保持草稿并说明原因
8. **收尾**：停在 PR 分支，`git status --porcelain` 为空；回报 PR 链接、每条验收命令的结果、运行验证每项结论、「等你处理」各条
9. **合入 develop**（批量模式由调度员做）：没有 PR 的 issue 跳过。按 `agent-issue.md`「合入 develop」逐条核对合并条件，有一条不成立就不合并，回报原因。全部成立时等 CI 并合并，把「发版前」各条写进 Release PR 的 Checklist，按根 `CLAUDE.md`「合并后清理」删分支，回到 `develop`
