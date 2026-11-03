# 交给 agent 自动做的 issue

`issue-spec`（用户在场时拍板）、`issue-impl`（做一条）与 `issue-autorun`（用户不在时批量做）之间的约定。`issue-impl` 与 `issue-autorun` 只认这里定义的标签和 issue 正文结构，不读对话。

game 仓库的 [agent-issue.md](https://github.com/windy10v10ai/game/blob/develop/.claude/references/agent-issue.md) 有一份完整版。标签含义、正文结构、排序规则、「合入 develop」两边保持一致，改这几处要两边同步；实机验证与验收命令各仓库自己定。

## 标签

| 标签 | 谁打 | 含义 |
|---|---|---|
| `agent-todo` | `issue-spec`，用户确认后 | spec 已拍板，等 agent 自动做 |
| `agent-done` | `issue-autorun`、`issue-impl` | 已开 PR。合并条件全过的已合入 `develop`，没过的 PR 保持开着，原因写在 PR「等你处理」，见「合入 develop」 |
| `agent-block` | `issue-autorun` | 整条 issue 一点都做不了，原因写在 issue 留言里 |

一个 issue 同时只带其中一个。用户处理完 `agent-block` 的留言、补好正文后换回 `agent-todo`。

### 级别标签

`issue-spec` 定 spec 时同时打一个，按「最难判定的那一项」定级：

| 标签 | 含义 | 判据 |
|---|---|---|
| `L1-code` | 代码端完结 | 运行验证「不需要」，jest / lint / 编译就能判对错 |
| `L2-script` | 脚本运行验证 | 要起 emulator 或 API，用脚本（curl、e2e）断言结果 |
| `L3-visual` | 截图判定 | 改网页界面，验证含「截图判定」项 |
| `L4-investigate` | 排查倒查 | 原因不明、要做假设反复试，或改动范围列不出来；不打 `agent-todo`，用户在场时做 |

「用户判定」项不影响级别，统一写进 Release PR 的 Checklist。

## issue 标题

标题从用户视角写想要实现的结果，不写具体改哪个东西的指令。判断方法：标题读起来像「想要什么」，不像「做什么操作」。

| 不好（指令） | 好（结果） |
|---|---|
| 生命之心改成 DataDriven 物品，生命回复借原版龙心 | 优化生命之心的回复 buff 性能 |
| 泉水光环合并为独立光环，避免传送后继承过高数值 | 传送离开泉水后不再继承过高的护甲与魔抗 |
| 削蓝减弱：基地去掉，泉水数值降低 | 减弱防御塔对英雄的削蓝 |

做法、字段名、文件名不进标题，写进正文或执行说明。新建 issue 和整理旧 issue 都按这个写，标题可以随用户习惯用中文或英文。

## issue 正文结构

issue 正文只放用户要看的几块，写得最短；写给执行 AI 的细节放进挂在 issue 上的 Markdown artifact「执行说明」，正文最后留一行压缩的链接，既方便人点开，也是 AI 找执行说明的依据：

```markdown
## 背景
一两句：现状是什么、为什么要做

## 目标
做完后玩家或开发者能观察到的结果，可拆成几条，各条尽量互不依赖

## 要求
用户亲口拍板的指示，一条一行；用户没说过的不写在这里

## 验收
用白话写怎么判对错：页面或接口会是什么样、哪个字段是什么值；命令、用例、脚本步骤放进执行说明

[执行说明](https://github.com/windy10v10ai/firebase/issues/<n>/artifacts/<编号>)
```

firebase 的功能 PR 不写 Release Note，所以没有这一块（game 仓库有，见其 `agent-issue.md`）。`issue-impl` 与 `issue-autorun` 先读正文，从最后那行链接取 artifact 编号，用 `gh issue artifact view <n> <编号> -R windy10v10ai/firebase` 读内容；正文没有链接时才退回 `gh issue artifact list <n> -R windy10v10ai/firebase` 按名字找「执行说明」，仍找不到或读不到当作没有执行说明。几块之间有冲突时，「要求」最大，其次「验收」，再其次执行说明。执行 AI 不读对话，所以「要求」里别写只有对话里才懂的话。

### 执行说明

名为「执行说明」的 Markdown artifact（`gh issue artifact create <n> -R windy10v10ai/firebase '<文件>.md#执行说明'`，改动用 `edit` 覆盖），面向执行者而不是用户。文件以 `# 执行说明` 开头，每一项都要写到不用再问的程度：

```markdown
# 执行说明

- **做法**：先写用哪个 skill（没有对得上的写「无」），再写已拍板的实现方案，含选型。AI 自己推断、用户没拍板的取舍标「建议」
- **改动范围**：允许改的文件或目录，逐条列出
- **不做**：明确排除的相关改动
- **验收命令**：必须通过的命令（见下文「默认验收命令」），以及要补的测试用例，每个用例写明输入与预期
- **运行验证**：需要 / 不需要；需要时逐项标层级（见下文「运行验证分三层」）并写操作步骤和预期值
- **上线顺序**：只改一个仓库写「无」；跨仓库（与 game 仓库）写清各开什么 PR、谁先部署
- **前提与后备**：方案依赖、还没实测过的第三方或线上行为，逐条写已验证（怎么验的、结果）或不成立时走哪条后备；都没有写「无」
- **跑不通时**：运行验证环境起不来时怎么判（如「只靠测试判定，复验项写进 Checklist」或「不合并，留给用户」）；不需要运行验证写「无」
```

artifact 是 GitHub 的预览功能，命令失败时把执行说明临时写回正文末尾的 `## 执行说明` 兜底，并在留言里说明，功能恢复后再迁回。

- 目标拆成几条互不依赖的小项，agent 卡在其中一条时才能跳过它继续做别的
- **做法**给出要照抄的已有实现（提交号或同类文件名）；数值、阈值、文案这类取舍在执行说明里定死，定不下来的写明「agent 暂定，记为待你决定」
- **运行验证**写到可判定：调哪个接口、带什么参数、返回什么字段应该是什么值，而不是「能正常工作」
- 写到「agent 不需要做判断」为止：定「做什么」和「怎么判对错」，不写代码怎么改
- 预期值来自实测，不抄被替换实现的读数

### 默认验收命令

| 改动目录 | 命令 |
|---|---|
| `api/` | `cd api && npm run lint && npm run test`；改了价格、上限这类业务常量再加 `npm run test:e2e` |
| `web/` | `cd web && npm run lint && npm run format:check && npx tsc --noEmit && npm run test && npm run build` |
| `launcher/` | 见 `launcher/CLAUDE.md` 的「校验」 |

### 运行验证分三层

每一项标明属于哪一层，能放进上层的不放下层：

| 层 | 适用 | 谁做、谁判 |
|---|---|---|
| 脚本判定 | 接口返回值、数据库写入结果、状态码、日志行 | 执行者起 emulator 跑脚本，每项打印 `[check] PASS` / `[check] FAIL`，`FAIL` 为 0 才算过；HTTP 状态码不代表业务结果，业务字段要单独断言 |
| 截图判定 | 页面布局、文字截断与折行、图片比例、悬停或点击后才出现的界面 | 执行者按 `web-browser-verify` 与 `web/CLAUDE.md`「PR 截图」操作并截图（375 与 1280 两档 × 中英俄三种语言），只交图和截图时的状态，不下结论；调度员看图判定 |
| 用户判定 | 页面手感、文案观感、需要连续观察的表现 | 不挡合并，写进 Release PR 的 Checklist，用户审批前测 |

## 合入 develop

用户确认 spec 就是授权：issue 做完且下面每条都成立时，调度员（单条模式是主对话）不等用户，直接合入 `develop`。只有合入 `main` 才部署，要用户看的事写进 Release PR 的 Checklist，Release PR 由用户审批。

合并条件：

- 「要求」没写合并前要用户看
- 目标全部完成（`Fixes #<id>`），没有跳过的部分
- 「验收」每条、运行验证的脚本判定与截图判定项都通过，没有没跑成的项；跑不通时按执行说明「跑不通时」判定，它写了只靠测试才能过
- 结果没有偏离「要求」和「验收」写的预期值
- 改动只在「改动范围」内，加「顺手发现的问题」带着修的小改动
- 审查结论通过，审查者不是写这份代码的会话
- 必过的 CI 全过

全部成立时：

```bash
gh pr checks <编号> -R windy10v10ai/firebase --required --watch   # 退出码 0 才继续
gh pr merge <编号> -R windy10v10ai/firebase --squash
```

有一条不成立就不合并：PR 保持开着（没做完的是草稿），原因写进 PR「等你处理」的「待你决定」，等用户处理。

### 写进 Release PR

合并后把 PR「等你处理」的「发版前」各条追加到 Release PR 的 `## Checklist` 末尾，一件事一行：

```markdown
- [ ] 试用：<看什么、和什么比>（[<这件事>](<PR 链接>)）
- [ ] 确认：<按什么默认做了、不同意要改哪里；跨仓库的上线顺序>（[<这件事>](<PR 链接>)）
- [ ] 上线后：<核对什么>（[<这件事>](<PR 链接>)）
- [ ] 是否开 issue：<问题与影响>（[<这件事>](<PR 链接>)）
```

- 只写用户本人要做或要确认的事：「用户判定」项、用户看得到且可能想改的默认取舍、跨仓库上线顺序、上线后才能核对的事、严重问题。其余写在 PR 正文
- 用 `gh pr list -R windy10v10ai/firebase --state open --label release --json number` 找 Release PR。改之前重读正文，只追加，其他内容原样保留；正文没有 `## Checklist` 时加在最前面
- 没有 Release PR 时等这次推送的 `Create Release PR` 工作流跑完再找（`gh run list -R windy10v10ai/firebase --workflow create_release_pr.yml --branch develop --limit 1`、`gh run watch <id>`）；仍没有就把这些项写进汇报

### 顺手发现的问题

和这条 issue 无关的旧问题都不挡合并，也不擅自开 issue：

| 问题 | 做法 |
|---|---|
| 小问题：几行，不改接口行为和页面效果，验收命令能兜底（错别字、注释、过时文档） | 带着修，PR 正文写一句 |
| 不小也不严重 | 不修，PR 正文写一句 |
| 严重：玩家数据或金钱受损、线上报错、安全问题 | 用户在场时用 `AskUserQuestion` 问要不要开 issue；不在场写进「发版前」的「是否开 issue」 |

## 子 issue

大 issue 拆成几批时用 GitHub 原生子 issue，正文不写「父 issue：#n」：

```bash
gh issue create -R windy10v10ai/firebase --parent <父n> ...
gh issue edit <父n> -R windy10v10ai/firebase --add-sub-issue <n>,<n>
```

子 issue 有先后依赖时只给当前一批打 `agent-todo`，前一批合并后再给下一批打。

## 适合交给 agent 的 issue

适合：有 jest / e2e 兜底的接口与模块逻辑、数据同步脚本、文案与文档、方案已定的小功能。

不交：要排查线上故障的（用 `debug-evidence` 在用户在场时做）、涉及支付与金钱路径的改动、改动范围列不出来的。

截图判定写在执行说明里要写清：截哪些页面、哪个状态、正确时应该看到什么（对照哪份设计稿或哪段文案）。
