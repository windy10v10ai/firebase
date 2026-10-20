---
name: game-data-sync
description: game 仓库新增或改动物品、抽选技能、换皮英雄，或 Dota 出了新英雄后，把图标、名字与百科数据同步进网站。用于「同步物品」「game 加了新物品」「百科数值改了网站没跟上」「抽选池改了」「新英雄头像缺了」「换皮英雄名字不对」这类任务，也用于排查 items / wiki:sync / heroes 脚本报错。觉醒改动走 awaken-sync。
---

# 同步 game 的物品、百科与英雄数据到网站

网站上物品、技能、英雄的名字和图标（战绩、百科、每日任务共用），以及百科的名单、档位、提示框，全部由脚本生成，**不手工维护**。

| 命令 | 产物 | 管什么 |
|---|---|---|
| `npm run items` | `config/items.json`、`config/abilities.json`，图在 `public/items/`、`public/abilities/` | 物品与抽选技能的图标、三语名字 |
| `npm run wiki:sync` | `config/wiki-items.json`、`wiki-abilities.json`（名单、档位、价格），`config/wiki-item-details.json`、`wiki-ability-details.json`（描述与数值） | 百科名单、档位、描述与数值；战绩页点开的说明也用它 |
| `npm run heroes` | `config/heroes.json`，图在 `public/heroes/` | 英雄小头像与中英文名 |

## 先判断跑哪个

- **新增物品或技能、换了图标、改了名字**：跑 `items`
- **抽选池（`lottery-items.ts`、`lottery-abilities.ts`）、商店（`shops.txt`）或自定义物品的配方有改动，或百科收录条目的数值、描述变了**：跑 `wiki:sync`
- **两者都沾**：先 `items` 再 `wiki:sync`。`wiki:sync` 查到池里条目不在 `items.json` 会直接失败
- **新增或改动自定义物品**：先 `items` 再 `wiki:sync`，商店分类按商店与配方自动收录；只动了原版物品时跑 `items` 即可
- **英雄**：Dota 出了新英雄，或 game 换皮英雄改了名字、头像时跑 `heroes`。名单取自每日任务池 `api/src/daily-task/config/tasks.ts`，新英雄要先加进任务池；换皮的名字和头像手写在 `config/hero-overrides.json` 与 `config/hero-overrides/`，改完再跑

不要靠「描述文件有没有改」判断百科要不要重跑：描述里带 `%占位符%`，只改一个 `AbilityValues` 数值也会变。拿不准就跑，产物没变化脚本会告诉你。

完成条件：确定了要跑的命令和顺序。

## 步骤

1. **准备 game 仓库最新 develop**。脚本默认读与本仓库并列的 `../windy10v10ai` 或 `../game`，`AWAKEN_GAME_REPO` 可指向别的绝对路径。并列的 game checkout 在别的分支上或有未提交改动时，**不要切它的分支**，另开 worktree：
   `git -C ../windy10v10ai fetch origin develop && git -C ../windy10v10ai worktree add --detach ../windy10v10ai-develop-sync origin/develop`，跑脚本时加 `AWAKEN_GAME_REPO=<该 worktree 的绝对路径>`，用完 `git worktree remove`。
   `wiki:sync` 会拒绝不在 `origin/develop` 上的提交；`items` 不检查，读到 feature 分支的数据也照样生成，所以这一步对它更要紧。
   完成条件：脚本读到的 game 提交在 `origin/develop` 上。
2. **跑 `cd web && npm run items`**。取图要 `sharp`：缺时先 `npm i sharp --no-save`，**不要写进 `package.json`**。
   要补玩家买过、配置推不出来的物品时，带上 GA 导出的物品表：`npm run items -- <导出.csv>`（第一列是物品名）。
3. **需要时跑 `npm run wiki:sync`**。自检不过就停下，把失败项原样报给用户，不要改产物或放宽自检。常见报错：

   | 报错 | 多半是 |
   |---|---|
   | 只解析出 N 条，少于下限 | game 侧改了抽选池的写法，脚本解析要跟着改 |
   | 不在 `config/<kind>.json` | 没先跑 `items` |
   | 在 KV 里找不到 | 池里写错了名字，或物品挪进了脚本没覆盖的 KV 文件（`items.mjs` 的 `ITEM_KV_FILES`） |
   | 缺 zh/en 描述、占位符取不到值 | game 本地化漏写或数值 key 改了名，回 game 修 |
   | 商店名单里的 X 在 KV 里找不到、消耗道具 X 不在商店里 | game 删了或改名了 `wiki-sync.mjs` 里排除、消耗道具、掉落三份名单中的物品，名单跟着改 |
   | X 算不出价格 | 新物品没写 `ItemCost`，配方材料也算不出价格，回 game 补 |
   | 描述有网站不认的标记 | game 本地化用了 `<br>`、`<b>`、`<h1>`、`<font>` 以外的标记；显示上不需要它就在 `dota-ability.mjs` 里去掉，需要就让 `GameText` 支持 |

4. **核对 diff**。新增条目的 `zh`、`en`、`ru` 都对，图标打开看一眼与游戏内一致。diff 里出现与本次无关的大量改动（成批改名、成批换图）先停下查原因再继续；零星一两条来自 Dota 官方数据的改名属于正常跟进，保留并在 PR 里写明。
   完成条件：每一行 diff 都能说出来源。
5. **校验**：`npm run lint && npx tsc --noEmit && npm run build`。
6. **开 PR**：分支 `chore/sync-<内容>`，正文写同步了哪些条目、game 的提交号、diff 里的额外变化及来源。

## 图标取不到

CDN 和 game 仓库都没有的图（多是饰品、野怪图标）只能从 Dota 客户端的 `pak01_dir.vpk` 导出。**停下来向用户要图**，逐个列出中文名与包内路径，不要拿同名原版图顶替。导出的 PNG 放进 `web/scripts/awaken-icons/`（觉醒共用这个目录），放法见 [awaken-sync](../awaken-sync/SKILL.md) 的「取图报取不到」一节，再重跑 `items`。

## 不要做的事

- **不要手改产物**（`config/items.json`、`abilities.json`、`wiki-*.json`）。下次同步会被覆盖。
- **不要动 `public/items/`、`public/abilities/` 里的文件名**。名字里的 hash 是缓存策略的基础。
- 提示框的取数规则以 [docs/web/ability-tooltip.md](../../../docs/web/ability-tooltip.md) 为准，与觉醒共用 `web/scripts/dota-ability.mjs`，改规则要两边都重跑。
