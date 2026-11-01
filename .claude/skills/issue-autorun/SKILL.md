---
name: issue-autorun
description: 用户不在时，按优先级依次派执行者把带 agent-todo 标签的 issue 从实现做到运行验证，各开 PR（审查通过转正式，没做完的保持草稿）。
disable-model-invocation: true
---

# issue-autorun

用户不在场时，把 firebase 仓库里所有带 `agent-todo` 的 issue 做完。能做的都做完，做不了的跳过并记下来，最后统一留给用户。标签与执行说明约定见 `.claude/references/agent-issue.md`，开始前先读。

一次只做一个 issue，全部在主 checkout 里做，顺序跑，省掉 worktree 和 emulator 端口冲突。每批在新对话里跑。

## 硬规则

- **只在开工前问一次**：第 2 步请用户选 issue，之后不提问，拿不准的按 `issue-impl`「卡住时怎么办」处理
- **只做有执行说明的 issue**
- **主 checkout 只在干净时用**：开工前和每个 issue 之间 `git status --porcelain` 为空；不干净就停掉剩下的全部 issue，写进汇报，不动用户的文件
- **不合并、不推 `develop` / `main`**，不审批 Release PR
- 调度员不改代码、不重跑执行者已跑过的验收，以 CI 和日志里看得到的结果为准
- 执行说明写了跨仓库上线顺序的，只做本仓库部分，另一仓库的部分记进「等你处理」

## 1. 排顺序

```bash
gh issue list -R windy10v10ai/firebase -l agent-todo --state open --limit 100 --json number,title,body
```

对每个 issue 查「开发计划」项目里的 Status 与 Priority（查询见 game 仓库 `issue-triage` 第 1 步），按下面的顺序排，前一项相同再比后一项：

1. Status：In progress → Todo → Plan → Backlog → 未入项目
2. Priority：Urgent → High → Medium → Low → 未填
3. 编号从小到大

## 2. 出计划

输出计划表（序号、issue 链接 + 标题、级别、Status / Priority、运行验证项数），再用一次 `AskUserQuestion`（`multiSelect: true`）请用户选这批跑哪些：不超过 4 条每条一个选项，默认推荐全部；超过 4 条给「全部按顺序」（推荐）和「前 3 条」。选完就开始。

## 3. 逐条做

按序号逐个做，前一个判定完再开下一个：

1. 主 checkout 干净，`git switch develop && git pull --ff-only`
2. 派执行者（子代理，模型按用户的全局约定，没有就用 Agent 工具；`run_in_background: true`），交接只写本条特有的内容：

```markdown
你在仓库主 checkout（当前目录）里做 issue windy10v10ai/firebase#<id>，用户不在场，从实现一直做到运行验证，中途不交回、不提问。
先读 `.claude/skills/issue-impl/SKILL.md` 并照它的步骤做，分支名 `<fix|feature>/<id>-<3–6 个英文小写单词>`。需求只看 issue 末尾的「执行说明」。
卡住时按 `issue-impl`「卡住时怎么办」处理。最终回复按 `issue-impl` 第 8 步写。
```

3. 读回报：PR 链接、验收结果、运行验证结论、「等你处理」
4. 对照执行说明核对 PR：目标是否全做、验收是否都过、`[check]` 是否 `FAIL` 为 0、改动是否超出范围；「截图判定」项由调度员逐张看图，按 `web-browser-verify` 的审截图要求（布局对齐、文字、图片比例）判定，执行者的描述不算结论。没过的退回原会话，同一 PR 最多退回两轮，仍不过记为「待你决定」
5. 精简 PR 的「等你处理」成只含用户本人要做的事，每条一句话写清看什么、选什么
6. 主 checkout 切回 `develop`，确认干净

执行者 30 分钟没有新输出或总时长超过 2 小时就停掉，读日志判断卡在哪：能接着做的退回继续一次，再卡记为「待你决定」，主 checkout 被留在半途时停掉后续 issue。

## 4. 收尾与汇报

按结果改标签并留言：

```bash
gh issue edit <id> -R windy10v10ai/firebase --remove-label agent-todo --add-label agent-done
gh issue comment <id> -R windy10v10ai/firebase --body "已开 PR：<链接>（保持草稿的写明原因）。等你处理 N 项，见 PR 正文。"
```

整条做不了的改打 `agent-block`，留言写明卡在哪、缺什么。已合并的本地分支按根 `CLAUDE.md`「合并后清理」删掉。

汇报按计划表顺序列出：PR 链接、「等你处理」条数、验收与运行验证结果、CI 状态、`agent-block` 的原因。issue 和 PR 编号都写成链接。用户回来按这份汇报用 `issue-spec` 逐个收拾。
