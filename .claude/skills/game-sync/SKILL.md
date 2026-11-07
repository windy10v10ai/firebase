---
name: game-sync
description: 把 game 仓库的觉醒、物品、抽选技能、百科与英雄数据同步进网站。用于「同步觉醒」「game 加了新觉醒」「同步物品」「百科数值改了网站没跟上」「抽选池改了」「新英雄头像缺了」「换皮英雄名字不对」这类任务，也用于排查 items / wiki:sync / awaken:sync / heroes 脚本报错。
---

# 同步 game 数据到网站

网站上觉醒页、物品与技能的名字和图标（战绩、百科、每日任务共用）、百科名单与提示框、英雄头像，全部由脚本从 game 仓库生成，**不手工维护**。

## 日常一条命令

`cd web && npm run game:sync`：按 物品 → 百科 → 觉醒图 → 觉醒数据 → 英雄头像 全量重生成，**一次同步的产物放同一个 PR**。不用判断「哪个更新了」，全量跑一遍只要几十秒，产物没变化脚本会告诉你。

- 步骤间的依赖是硬的：`wiki:sync` 要读 `items.json`，`awaken:sync` 要读图片清单，不要自己改顺序
- 这条链不接参数：预同步固定提交（`--game-commit`）与 `items` 带 GA 导出表都要单跑；跟在 `game:sync` 后面的参数只会追加到最后一步 `heroes`
- 整段输出看完：缺图、缺头像只告警，不会让命令失败
- 取图要 `sharp`：缺时先 `npm i sharp --no-save`，**不要写进 `package.json`**

单步命令用于排查某一步的自检失败：`items`、`wiki:sync`、`awaken:images`、`awaken:sync`、`heroes`。

## 什么时候跑

game 仓库动过下面任意一处就跑一次，**包括看起来与文案无关的数值调整**：

- 觉醒：`src/vscripts/modules/awaken/awaken-config.ts`（增删英雄、改限免）、`src/panorama/react/hud_main/pages/profile/tabs/AwakenTab.tsx`（展示顺序）
- KV：`game/scripts/npc/npc_abilities_custom_awaken.txt`、`npc_items_*.txt`、`shops.txt`
- 抽选池：`lottery-items.ts`、`lottery-abilities.ts`
- 本地化：`game/resource/addon_schinese.txt`、`addon_english.txt`、`addon_russian.txt`
- `docs/reference/` 升了 Dota 版本

**不要靠「哪些文件改了」判断要不要同步。** 描述里带 `%占位符%`，改一个 `AbilityValues` 数值、一个字的本地化都不碰，玩家看到的描述照样会变。

只改网站侧这几处时，跑单步：每日任务池 `api/src/daily-task/config/tasks.ts` 或换皮表 `web/config/hero-overrides.json` 改了 → `npm run heroes`（这时 game 仓库没有改动）。

## 步骤

1. **准备 game 数据源**。默认用最新 `develop`。脚本找与本仓库并列的 `../windy10v10ai` 或 `../game`，其他位置用 `AWAKEN_GAME_REPO` 指绝对路径。并列的 game checkout 在别的分支或有未提交改动时，**不要切它的分支**，另开 worktree：`git -C ../windy10v10ai fetch origin develop && git -C ../windy10v10ai worktree add --detach ../windy10v10ai-develop-sync origin/develop`，跑脚本时加 `AWAKEN_GAME_REPO=<该 worktree 的绝对路径>`，用完 `git worktree remove`。`docs/reference/` 若未被 git 跟踪（常见），把对应 Dota 版本目录只读复制进副本。
   `items`、`wiki:sync`、`awaken:sync` 都要求 HEAD 在 `origin/develop` 上（觉醒只判断祖先关系）：feature 分支上的改动还可能被推翻或改写，据此生成的产物没法追溯。**用户明确指定未合并分支时**，在独立副本检出该提交，`items` 与 `wiki:sync` 追加 `-- --game-commit=<完整 SHA>`（必须匹配副本 HEAD），在 PR 写明来源与游戏发布依赖，不要动正在测试的原 game checkout。
2. **跑 `npm run game:sync`**。
3. **自检不过就停下**，把失败项原样报给用户，**不要猜着改产物**——自检拦住的多半是 game 侧漏同步（比如加了觉醒英雄但忘了同步 `AwakenTab.tsx`），要回 game 仓库修。
4. **产物没变化就到此为止**，不开 PR。
5. **核对 diff**：新增条目的 `zh`、`en`、`ru` 都对，图标打开看一眼与游戏内一致。与本次无关的大量改动（成批改名、成批换图）先停下查原因；零星来自 Dota 官方数据的改名属正常跟进，保留并在 PR 里写明。
6. **写变更说明**：拿产物里**改动前**那一版的来源提交（`git show HEAD:web/config/awaken.ts | head -10` 的 `AWAKEN_SOURCE.gameCommit`、`web/config/wiki-*.json` 的 `source.gameCommit`），`git -C <game> log --oneline <旧SHA>..HEAD -- <相关路径>`。git 历史用来解释「为什么变了」，产物 diff 回答「变了什么」。
7. **校验**：`npm run lint && npm run format:check && npx tsc --noEmit && npm run test && npm run build`。
8. **开 PR**：分支 `chore/sync-<内容>`（如 `chore/sync-game-data-2026-11-05`），正文写同步了哪些条目、game 的提交号、diff 里的额外变化及来源。一次同步一个 PR，觉醒与物品百科的产物不要各开一个。

## 产物里的技能提示框数据

每个技能除了名字、标题、描述，还有 `ability` 字段：技能属性、数值行、冷却、耗蓝、背景故事，供觉醒卡与百科的悬浮提示、详情弹窗用。**取数规则以 [docs/web/ability-tooltip.md](../../../docs/web/ability-tooltip.md) 第 5 节为准**，觉醒与百科共用 `web/scripts/dota-ability.mjs`：改规则先改文档，再改脚本，然后两边的产物都要重跑。

- **神杖 / 魔晶升级说明**：游戏放在 `_scepter_description` / `_shard_description`，网站接在描述末尾、用游戏里的物品名做段标题；数值取升级形态（多级基础值按级应用增量，占位符多一层 `bonus_` 前缀时取增量本身）。数值取不到就整段不接、不告警，主描述的占位符取不到仍然拦
- **某个技能少一行数值**：先查 game 本地化有没有 `DOTA_Tooltip_ability_<技能名>_<key>` 标签，没有标签的按规则不展示，要回 game 补标签，不要在网站侧放宽
- **属性文案**（技能、影响、伤害类型等）在 `web/messages/*.json` 的 `ability` 命名空间，不来自同步；KV 出现新的取值时脚本输出 `null`，页面不显示该项，要在脚本与文案里一起补

## 自检拦的是什么

失败时按这两张表判断该回哪儿改。觉醒：

| 报错 | 多半是 |
|------|------|
| 只解析出 N 个英雄，少于下限 | game 侧重构了 `AWAKEN_ABILITIES` 的写法，脚本的正则要跟着改 |
| AwakenTab.tsx 与 awaken-config.ts 的英雄对不上 | **game 侧漏同步**，回 game 修，不要改网站 |
| 限免标记与 FREE_TRIAL_HEROES 对不上 | 同上 |
| 缺 zh/en 标题或描述 | 新觉醒只写了中文，回 game 补另一种语言 |
| 有占位符取不到值 | 数值 key 改了名，或技能挪进了脚本没覆盖的 KV 文件 |
| 缺 zh/en 英雄名 | Dota 版本目录升级后 key 变了 |
| 没有立绘 | 先跑 `npm run awaken:images` |
| 标题、描述或背景故事残留回车、反斜杠转义 | 本地化解析没还原干净，或换行归一化失效，查 `dota-ability.mjs` 的 `unescapeKv` |

物品与百科：

| 报错 | 多半是 |
|------|------|
| 只解析出 N 条，少于下限 | game 侧改了抽选池的写法，脚本解析要跟着改 |
| 不在 `config/<kind>.json` | 没先跑 `items` |
| 在 KV 里找不到 | 池里写错了名字，或物品挪进了脚本没覆盖的 KV 文件（`items.mjs` 的 `ITEM_KV_FILES`） |
| 缺 zh/en 描述、占位符取不到值 | game 本地化漏写或数值 key 改了名，回 game 修 |
| 商店名单里的 X 在 KV 里找不到、消耗道具 X 不在商店里 | game 删了或改名了 `wiki-sync.mjs` 里排除、消耗道具、掉落三份名单中的物品，名单跟着改 |
| X 算不出价格 | 新物品没写 `ItemCost`，配方材料也算不出价格，回 game 补 |
| 描述有网站不认的标记 | game 本地化用了 `<br>`、`<b>`、`<h1>`、`<font>` 以外的标记；显示上不需要它就在 `dota-ability.mjs` 里去掉，需要就让 `GameText` 支持 |

## 图标取不到

CDN 和 game 仓库都没有的图（多是饰品、野怪图标）只能从 Dota 客户端的 `dota 2 beta/game/dota/pak01_dir.vpk` 导出。**停下来向用户要图**，不要留占位上线，也不要拿同名原版图顶替——长得和游戏内不一样。问的时候逐个列出：条目中文名、包内路径 `panorama/images/spellicons/<AbilityTextureName>_png.vtex_c`。

收到的 PNG 按贴图路径原样放进 `web/scripts/awaken-icons/`，文件名去掉 `_png`，如 `bristleback/bb_2022_immortal_ability_icon/bb_2022_immortal_bristleback.png`，再重跑。有导出文件时脚本优先用它，清单里已有的旧图会被替换；导出的原图要进 git，下次重跑才取得到。觉醒取图与百科的 `npm run items` 共用这个目录。

图标取不到只告警不拦：页面按缺图占位渲染。

## 不要做的事

- **不要手改产物**（`config/awaken.ts`、`awaken-assets.json`、`items.json`、`abilities.json`、`wiki-*.json`、`match-*.json`、`heroes.json`）。它们是产物，下次同步会被覆盖。
- **不要为了让自检通过而放宽自检**。自检是这条链路唯一的安全网。
- **不要把 `sharp` 写进 `package.json`**。只有取图用得到，装进依赖会让每次部署都多背几十 MB。
- **不要动 `web/public/dota/`、`public/items/`、`public/abilities/`、`public/heroes/` 里的文件名**。名字里的 hash 是缓存策略的基础，手改会让旧图永远刷不掉。
