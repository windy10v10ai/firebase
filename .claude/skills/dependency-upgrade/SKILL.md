---
name: dependency-upgrade
description: 处理 Dependabot 依赖升级时加载——「看看依赖升级 PR」「处理 dependencies 标签的 PR」「有没有安全告警」「依赖升级怎么合」。覆盖 PR 盘点、安全告警盘点、风险分批、合并顺序与合并后监测。
---

# 依赖升级

目标：**安全问题先修，其余按风险从低到高分批合并，每批合并后确认没出新问题**。调查和出报告不动任何 PR；合并只在用户下指令后执行。

分支保护要求审批，Claude 不能自己批准。用户说「设置自动合并」时，只执行 `gh pr merge <编号> --squash --auto`，把 PR 链接给用户去批准，不用 `--admin`。合并方式与清理见 `.claude/CLAUDE.md` 的「合并方式」。

## 1. 盘点 PR 与安全告警

```bash
gh pr list --label dependencies --state open --limit 100 --json number,title,headRefName,mergeable,statusCheckRollup
gh api '/repos/windy10v10ai/firebase/dependabot/alerts?state=open&per_page=100' --paginate --jq '.[] | "\(.number)\t\(.security_advisory.severity)\t\(.dependency.package.name)\t\(.dependency.manifest_path)\t\(.dependency.scope)\tfix:\(.security_vulnerability.first_patched_version.identifier // "none")"'
```

CI 状态里有 `FAILURE` 的 PR 先记下失败的 job，不进合并批次。配置在 `.github/dependabot.yml`（nestjs 同组发 PR，`@types/node` 大版本不自动升，冷却 5 天），读它再判断「为什么没有某个 PR」。

告警列表要带 `--paginate`，并在合并、发布的各个节点重查：新告警随时会冒出，不带分页会漏看。告警按默认分支 `develop` 扫描，修复合入后要等一会儿才会关闭，以锁文件里的版本为准（`git show origin/develop:<目录>/package-lock.json`）。

完成条件：每个 PR 和每条告警都有记录。

## 2. 把告警对到 PR 上

对每条告警，在 `npm ls <包>`（在对应的 `api/` 或 `web/` 目录）里查它的来源链和当前版本，再看有没有 PR 的 lockfile 会换掉它：

```bash
gh pr diff <编号> | grep -A3 'node_modules/<包>"'
```

- **有 PR 能修**：该 PR 提前到合并顺序最前
- **没有 PR 能修**（多为间接依赖，Dependabot 不单独发 PR）：列入「需要手动升级」。先看告警的受影响范围，修复版本落在依赖方允许的范围内才能升（例：依赖方要求 `^10`，修复版本是 11.x，就不能靠升级解决，只能等上游或在告警页容忍风险）。能升的只改锁文件里目标包的版本、`resolved`、`integrity` 三项，用 `npm view <包>@<版本> dist.tarball dist.integrity` 取值；`npm update --package-lock-only` 会顺带改写无关条目（如删掉 `libc` 字段），改完用 `git diff` 确认只剩目标包。跑该目录的校验，另开 chore 分支，按「小改动搭车」的判据决定是否并入进行中的 PR

校验前确认 `node -v` 与仓库根目录 `.nvmrc` 一致（24.x）。版本不对时 api 的 Jest 会让几乎每个套件都报 `Must use import to load ES Module`，不是依赖的问题。

完成条件：每条告警都标明「由哪个 PR 修」「需手动升级」或「无兼容修复，容忍风险」。

## 3. 读更新日志并分级

只提取 Breaking、安全公告、行为修复。碰到安全公告，核对仓库当前版本是否已受影响（例：`eslint-config-next` 的日志里有 `next` 的 RCE 公告，要去 `package.json` 查 `next` 本体版本，不能因为升的是配置包就略过）。

| 批次 | 内容 | 合并后 |
|---|---|---|
| 安全优先 | 能修 high / critical 告警的 PR | 发布并跑 `deploy-monitor` |
| A | GitHub Actions | 盯下一次 Deploy 工作流，PR 的 CI 跑不到它们 |
| B | 补丁版、lint 与测试工具 | 无需单独监测 |
| C | 运行时依赖的 minor / major | 发布并跑 `deploy-monitor` |

`stripe`、`firebase*`、`@nestjs/*`、`next`、`react` 一律按 C 看。用 `grep -rE` 在 `src/` 里查更新日志提到的功能（文件上传、SSE、中间件、异常过滤器等）是否被用到，用到的写进报告，并确认 CI 里哪个 job 覆盖得到，覆盖不到的写进合并后复查项。

完成条件：每个 PR 有批次、风险一句话和合并后复查项。

## 4. 出报告，等用户拍板

先说结论：能不能全部合，顺序是什么。再按批次列出，最后列「需手动升级」和「要用户决定的事」。用户问「某个 PR 批准风险大吗」时，答依据：CI 覆盖、仓库是否用到变动功能、回滚是否安全。

完成条件：用户拿到顺序和每批的风险。

## 5. 合并与发布

用户下令后按批次：对该批所有 PR 执行 `--squash --auto`，把链接给用户审批。同一批里同组或互相依赖的包（如两个 `@typescript-eslint/*`）一起合。一个个合会让后面 PR 的 lockfile 冲突，在冲突 PR 上评论 `@dependabot rebase`。

合进 `develop` 后，Release PR 由用户审批发布。**发布前确认 Release PR 的提交列表包含这批 PR**；Release PR 未合并时部署不会发生，先不要启动监测。

完成条件：这批 PR 状态为 MERGED，用户已发布或明确要等。

## 6. 发布后

安全优先批和 C 批发布后加载 [deploy-monitor](../deploy-monitor/SKILL.md)。监测通过后，到 Dependabot 告警页确认对应告警已关闭；没有关闭的回到第 2 步。

合并后的清理见 `.claude/CLAUDE.md` 的「合并后清理」。踩到新坑，用 [doc-update](../doc-update/SKILL.md) 补进本文。
