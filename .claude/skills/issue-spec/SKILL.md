---
name: issue-spec
description: 和用户一起给某个 issue 定 spec，写成 issue 正文（背景、目标、要求、验收、执行说明）交给 agent 自动做；或处理 agent 做完、卡住后留下的问题。
---

# issue-spec

用户在场时，和用户把一个 issue 的做法谈定，整理成 `agent-issue.md`「issue 正文结构」那几块，执行说明写成 Markdown artifact 挂到 issue，并打 `agent-todo`，留给 `issue-autorun` 在用户不在时自动做。只定到 spec 为止，不写实现计划、不改代码（验证前提用临时脚本，验完删）。标签与正文结构见 `.claude/references/agent-issue.md`，开始前先读。

用户给的不是 issue 而是一句想法时，先查重再新建：先 `gh issue list -R windy10v10ai/firebase --state all --search "<关键词>"` 搜已有 issue（含已关闭的），有相近的就接着谈那一条；没有才 `gh issue create` 新建，标题写想要的结果，Status 放 Plan（命令见 game 仓库 [issue-fields.md](https://github.com/windy10v10ai/game/blob/develop/.claude/references/issue-fields.md)），再从下一步补字段。用户没指定 issue 也没给想法时，从项目 Plan 栏最上面那条开始。

## 1. 补齐 issue 字段

只看当前这条 issue，缺哪项补哪项：Type、Priority、Effort、仓库标签、组织项目「开发计划」（`gh project` 编号 3）里的 Status。查询与设置命令、字段 ID 见 game 仓库的 [issue-fields.md](https://github.com/windy10v10ai/game/blob/develop/.claude/references/issue-fields.md)，项目和 Type、Priority、Effort 字段是组织级的，两个仓库共用。缺项按 issue 内容给建议值，第 3 步一并让用户确认后再设。

## 2. 读懂 issue

读正文、评论、关联的 issue / PR，再读相关代码，读到能说清「现在是什么样、要改成什么样」为止。

判断是否适合交给 agent（标准见 `agent-issue.md`「适合交给 agent 的 issue」）。不适合时告诉用户原因，打 `L4-investigate`，用户在场时做。

## 3. 和用户谈定

一次只谈一个问题。简单的选择题（2–3 个选法）用 `AskUserQuestion` 并标出推荐；复杂的问题（数据流、多层改动、方案对比、页面布局）不用文字来回问，用 `Artifact` 工具发布一页 HTML 和用户谈，页面里画流程图、方案对比和改动前后对比，排版先读 `artifact-design` skill。重点谈清：

- 做法的选型
- 改动范围：列得出具体文件或目录
- 不做什么
- 要补哪些测试，输入与预期值
- 要不要跨仓库改（game 仓库），各开什么 PR、谁先部署
- 目标能否拆成几条互不依赖的小项
- 方案依赖的第三方或线上行为：还没实测过的，打 `agent-todo` 前先验证；验证不了的，定好不成立时走哪条后备
- 运行验证环境跑不通时怎么判，以及哪些项要用户试用（审批前写进 Release PR 的 Checklist）

能从代码或项目规则直接得出的不问，直接写进草稿。谈完按 `agent-issue.md`「合入 develop」逐条预演：每条验收都说得出 AI 怎么判对错，判不了的已定死或归用户判定，前提不成立、环境跑不通时都有去处，agent 做完不用问用户就能决定合不合并。

## 4. 写入 issue

标题按 `agent-issue.md`「issue 标题」改成想要的结果，不是具体指令。

按 `agent-issue.md` 的正文结构写：背景、目标、要求、验收放前面，写得最短，执行说明不进正文，写成 Markdown artifact「执行说明」，正文最后只放一行它的压缩链接。「要求」只写用户亲口拍板的，AI 自己推断的取舍写进执行说明并标「建议」；「验收」用白话写怎么判对错。给用户确认时不贴全文，只列三组重点：用户拍板的（即「要求」）、按默认做的（附「不同意就说」）、运行验证要读什么；全文写进 issue 后给链接。

用过讨论页的，定稿后把 HTML「设计」也挂到 issue 给人看（命令见 game 仓库 `.claude/references/doc-writing.md`「issue artifact」），设计里和实现有关的结论要写进「执行说明」，agent 不读 HTML。

用户确认后写进 issue：正文用 `gh issue edit --body-file`，执行说明先建 artifact 再把链接写进正文（旧 issue 正文里的执行说明迁进 artifact，内容保留），再打标签：

```bash
gh issue artifact create <n> -R windy10v10ai/firebase '<文件>.md#执行说明'   # 已有时用 edit <n> <编号> --body-file
gh issue edit <n> -R windy10v10ai/firebase --body-file <文件>
gh issue edit <n> -R windy10v10ai/firebase --add-label agent-todo --add-label <L1-code|L2-script|L3-visual>
```

打完标签后把项目 Status 改成 Todo 并挪到该栏最上面（状态含义与命令见 game 仓库 [issue-fields.md](https://github.com/windy10v10ai/game/blob/develop/.claude/references/issue-fields.md)），用户没指定 issue 时从 Plan 栏最上面那条开始谈。

完成条件：issue 正文是用户确认过的新结构，「执行说明」artifact 已挂上，带 `agent-todo` 与一个级别标签。

## 处理 agent 留下的问题

- **`agent-done`，PR 还开着**：读 PR 正文的「等你处理」，逐条和用户过。「待你决定」的谈定后直接在该 PR 分支上补改，或写进「要求」另起一轮
- **Release PR 的 Checklist**：逐条和用户过。不满意的在新分支上改，或写进新 issue
- **`agent-block`**：读 issue 下 agent 的留言，按第 3 步补齐缺的信息，更新正文后把标签换回 `agent-todo`

```bash
gh issue edit <n> -R windy10v10ai/firebase --remove-label agent-block --add-label agent-todo
```
