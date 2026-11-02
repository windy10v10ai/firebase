---
name: deploy-monitor
description: API 部署后盯线上是否引入新问题时加载——「盯一下部署」「Release 合并了看看部署正常不」「部署后有没有出错、变慢」。覆盖 Deploy Firebase 工作流发布的 Cloud Run 服务 `client`；网站由 App Hosting 单独发布，不在此列。
---

# 部署后监测

目标只有一个：**这次部署有没有引入新问题**。部署前就有的报错、慢接口不报，只报部署后新出现或明显变差的。分两段：部署后 15 分钟内查严重故障，发现就立刻报告；约一小时后做完整对比，给出综合判断。

日志与指标的查法、字段形状见 [debug-evidence](../debug-evidence/SKILL.md)。**只读日志，不用 gcloud 改线上任何资源**；回滚等动作给建议，由用户执行。

## 1. 等部署完成，定部署时刻 T0

**Release PR 还没合并（等 CI 或自动合并中）时就开始，不等用户说「已发布」。**先用 `gh pr list --base main --state open` 找到 Release PR，用 `run_in_background` 跑一个脚本：循环 `gh pr view <编号> --json state` 到 `MERGED`，再取 `createdAt` 不早于 `mergedAt` 的 Deploy 工作流运行，`gh run watch` 到结束，最后打印新旧版本。脚本结束时会通知，不要轮询。

```bash
gh run list --workflow "Deploy Firebase" --branch main --limit 3 --json databaseId,status,conclusion,createdAt
```

运行中的用 `run_in_background` 跑 `gh run watch <id> --interval 30 --exit-status`，结束时会通知，不要轮询。失败就立刻报告失败的步骤（`gh run view <id> --log-failed`），后面不用做。

成功后取新旧版本：

```bash
gcloud run revisions list --service client --region asia-northeast1 --project windy10v10ai --limit 2
```

**T0 取新版本的 `DEPLOYED` 时间**，不用 GitHub 或本机时钟，两者都可能和 Cloud Logging 差出整小时。macOS 的 `date` 不支持 `-d`，前后窗口的时间戳按 T0 手算。

完成条件：拿到新旧版本名与 T0，或已报告部署失败。

## 2. 列出这次改了什么

```bash
gh pr list --base main --state merged --limit 1 --json number,title
gh pr view <release 编号> --json commits -q '.commits[].messageHeadline'
git fetch -q origin main && git diff --stat origin/main^1 origin/main -- api/ firestore.rules firebase.json
```

对每个改了 `api/` 的 PR，记下它影响的接口与日志消息（diff 里的路由装饰器、`logger.*` 的第一个参数），第 3、4 步专门看这些。`firestore.rules` 有改动时，规则错误在 API 日志里看不到，报告里提醒用户在网站上点一下相关页面。

同时查同一时段有没有别处的发版，它们会混进对比结果：

```bash
git -C ../windy10v10ai log -5 --tags --simplify-by-decoration --format='%h %ad %D' --date=iso   # game 仓库，不在就用 ../game
gh run list --workflow launcher-release.yml --limit 3 --json conclusion,createdAt         # 启动器编译，发布在它之后
```

完成条件：每个 API 改动都对应到要重点看的接口或日志消息；T0 前后两小时内其他发版已列出。

## 3. 15 分钟内：查严重故障

部署完成后立即查一次，T0+15 分钟再查一次（用后台 `sleep 600` 等，结束会通知）。窗口都从 T0 开始：

```bash
F='resource.type="cloud_run_revision" AND resource.labels.service_name="client"'
# 各版本状态码分布
gcloud logging read "$F AND log_id(\"run.googleapis.com/requests\") AND timestamp>=\"<T0>\"" --project windy10v10ai --limit 10000 \
  --format='value(resource.labels.revision_name,httpRequest.status)' | awk '{print $1, substr($2,1,1)"xx"}' | sort | uniq -c
# 4xx/5xx 落在哪些接口
gcloud logging read "$F AND log_id(\"run.googleapis.com/requests\") AND timestamp>=\"<T0>\" AND httpRequest.status>=400" --project windy10v10ai --limit 300 \
  --format='value(httpRequest.status,httpRequest.requestMethod,httpRequest.requestUrl)' | sed -E 's/[0-9]{6,}/:id/g; s/\?.*//' | sort | uniq -c | sort -rn | head -20
# 未捕获异常与 logger.error
gcloud logging read "$F AND severity>=ERROR AND timestamp>=\"<T0>\"" --project windy10v10ai --limit 50 \
  --format='value(timestamp,resource.labels.revision_name,jsonPayload.message,textPayload)'
```

下列任何一条成立就是严重故障，**不等一小时，立刻向用户报告**：现象、受影响接口、样本日志、疑似来源 PR、建议（多半是回滚到旧版本）。

- 新版本出现 5xx 或 ERROR 日志，且同一条消息在 T0 前 24 小时里没有出现过（拿消息原文按 `timestamp<"<T0>"` 再查一次）
- 第 2 步列出的重点接口在部署后 4xx 比例明显高于部署前，或请求全部失败
- 主干接口（`game/start`、`game/end`、`launcher/rooms/*`、`proxy/*`）部署后几乎没有请求，而部署前同样时长有上百条

没有严重故障时简短告诉用户「前 15 分钟正常」和关键数字，然后后台等到 T0+65 分钟。

完成条件：两次检查都做完，严重故障已报告，或已告知用户前 15 分钟正常。

## 4. 约一小时：和部署前对比

T0+65 分钟后导出两段等长的请求日志：部署后去掉前 5 分钟冷启动（`[T0+5m, T0+65m)`），部署前取 `[T0-60m, T0)`。

```bash
D=<scratchpad 目录>
for w in "before <T0-60m> <T0>" "after <T0+5m> <T0+65m>"; do set -- ${=w}   # zsh 不自动按空格拆变量，要用 ${=w}
  gcloud logging read "$F AND log_id(\"run.googleapis.com/requests\") AND timestamp>=\"$2\" AND timestamp<\"$3\"" --project windy10v10ai --limit 30000 \
    --format='csv[no-heading](timestamp,httpRequest.requestMethod,httpRequest.requestUrl,httpRequest.latency,httpRequest.status,resource.labels.revision_name)' > $D/$1.csv
done
python3 -I .claude/skills/deploy-monitor/scripts/compare_windows.py $D/before.csv $D/after.csv
```

脚本输出整体状态码比例、按接口的 4xx/5xx 与延迟分位数，末尾「待核实」列出疑似回归：新出现的 5xx、错误比例翻倍、样本够多时 p95 涨五成以上、接口请求量占比翻倍或减半、部署前有而部署后消失的接口。两边条数相差很多，或某边正好等于 `--limit`，说明被截断，缩短窗口重导。

请求日志只看得到状态码。业务上的拒绝多数回 2xx，要再对比结构化日志的消息与原因：

```bash
for w in "<T0-60m> <T0>" "<T0+5m> <T0+65m>"; do set -- ${=w}; echo "== $1"
  gcloud logging read "$F AND severity>=WARNING AND jsonPayload.message:* AND timestamp>=\"$1\" AND timestamp<\"$2\"" --project windy10v10ai --limit 5000 \
    --format='value(jsonPayload.message,jsonPayload.reason)' | sort | uniq -c | sort -rn | head -20
done
```

第 2 步记下的重点接口与日志消息，无论脚本有没有标出，都要在两段里逐个对比；新增的接口确认请求确实到了新版本、状态码符合预期，包过 `timeStep` 的分段计时日志也在写。

完成条件：「待核实」每一条、结构化日志里次数翻倍的每一种消息、每个重点接口，都已归入下一步的一类。

## 5. 判断是不是这次引入的

对每个疑点按顺序排除，排除不掉的才是新问题：

1. **部署前就有**：部署前窗口里同样比例出现，忽略
2. **时段起伏**：只是请求量变了，拿前一天同一时段（同样时长、同样时钟时间）再对比一次；昨天同时段也这么多就是正常起伏
3. **别处发版**：变化的起点对上第 2 步列出的 game 或启动器发版，而不是 T0，就去那边的 diff 找原因（例：game 改了结算重试，经转发的结算请求量翻倍，被冷却挡掉的次数跟着翻倍，API 本身没问题）
4. **聚合假象**：分组键在不同请求间取同一个占位值（如本地游戏的 `matchId` 为 0），把不同的游戏算成了重复
5. **样本太少**：某个接口一小时只有几十条请求，p95 的涨跌不下结论

部署后一小时内数据不足以判断的，写明还需要再看多久、看什么。

完成条件：每个疑点都标明「新问题」或排除理由。

## 6. 报告

先说结论：**部署正常**，或**有 N 个新问题**。然后：

- 对比摘要：两段时间各自的请求数，5xx 与 ERROR 条数，4xx 比例，整体 p50 / p95
- 重点接口：第 2 步列出的接口改动后表现如何，一两句话
- 新问题逐条：现象与数字、证据（日志样本、时间分布）、疑似来源（哪个 PR 或哪次别处发版）、建议的处理方式
- 排除掉的疑点：一句话各说明为什么不算

问题在 API 侧时，建议的处理方式写明回滚还是追加修复；问题在 game、启动器等别的仓库时，指出那边的提交，问用户要不要去修。

完成条件：用户拿到结论和每个新问题的下一步动作。
