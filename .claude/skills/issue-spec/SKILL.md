---
name: issue-spec
description: 和用户一起给某个 issue 定 spec，写成执行说明交给 agent 自动做；或处理 agent 做完、卡住后留下的问题。
---

# issue-spec

用户在场时，和用户把一个 issue 的做法谈定，写成 issue 正文里的 `## 执行说明` 并打 `agent-todo`，留给 `issue-autorun` 在用户不在时自动做。只定到 spec 为止，不写实现计划、不改代码。标签与执行说明格式见 `.claude/references/agent-autorun.md`，开始前先读。

## 1. 补齐 issue 字段

只看当前这条 issue，缺哪项补哪项：Type、Priority、Effort、仓库标签、组织项目「开发计划」（`gh project` 编号 3）里的 Status。查询与设置命令、字段 ID 沿用 game 仓库 `issue-triage` skill 的「配置」表与第 4 步（`../windy10v10ai/.claude/skills/issue-triage/SKILL.md`），项目和 Type、Priority、Effort 字段是组织级的，两个仓库共用。缺项按 issue 内容给建议值，第 3 步一并让用户确认后再设。

## 2. 读懂 issue

读正文、评论、关联的 issue / PR，再读相关代码，读到能说清「现在是什么样、要改成什么样」为止。

判断是否适合交给 agent（标准见 `agent-autorun.md`「适合交给 agent 的 issue」）。不适合时告诉用户原因，打 `L4-investigate`，用户在场时做。

## 3. 和用户谈定

一次只问一个问题，用 `AskUserQuestion` 给 2–3 个选法并标出推荐。按执行说明的每一项过一遍，重点谈清：

- 做法的选型
- 改动范围：列得出具体文件或目录
- 不做什么
- 要补哪些测试，输入与预期值
- 要不要跨仓库改（`../windy10v10ai`），各开什么 PR、谁先部署
- 目标能否拆成几条互不依赖的小项

能从代码或项目规则直接得出的不问，直接写进草稿。

## 4. 写入 issue

按 `agent-autorun.md` 的格式写出执行说明。给用户确认时不贴全文，只列三组重点：用户拍板的、按默认做的（附「不同意就说」）、运行验证要读什么；全文写进 issue 后给链接。

用户确认后写进 issue 正文末尾（已有 `## 执行说明` 时整段替换），再打标签：

```bash
gh issue edit <n> -R windy10v10ai/firebase --body-file <文件>
gh issue edit <n> -R windy10v10ai/firebase --add-label agent-todo --add-label <L1-code|L2-script|L3-visual>
```

完成条件：issue 正文末尾是用户确认过的执行说明，带 `agent-todo` 与一个级别标签。

## 处理 agent 留下的问题

- **`agent-done`**：读 PR 正文的「等你处理」，逐条和用户过。「请确认」的确认或改掉；「待你决定」的谈定后直接在该 PR 分支上补改，或写进执行说明另起一轮
- **`agent-block`**：读 issue 下 agent 的留言，按第 3 步补齐缺的信息，更新执行说明后把标签换回 `agent-todo`

```bash
gh issue edit <n> -R windy10v10ai/firebase --remove-label agent-block --add-label agent-todo
```
