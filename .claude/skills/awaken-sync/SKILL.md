---
name: awaken-sync
description: game 仓库新增或改动觉醒技能后，把数据与图片同步进网站。用于「同步觉醒」「game 加了新觉醒」「觉醒数值改了网站没跟上」这类任务，也用于排查同步脚本自检失败。
---

# 同步 game 的觉醒改动到网站

网站的觉醒页数据全部由脚本从 game 仓库生成，**不手工维护**。设计与取舍见
[docs/design/web/phase-3b-awaken-page.md](../../../docs/design/web/phase-3b-awaken-page.md)。

## 什么时候跑

game 仓库动过下面任意一处就该跑一次，**包括看起来与文案无关的数值调整**：

- `src/vscripts/modules/awaken/awaken-config.ts`（增删觉醒英雄、改限免名单）
- `src/panorama/react/hud_main/pages/profile/tabs/AwakenTab.tsx`（展示顺序、展示哪个技能）
- `game/scripts/npc/npc_abilities_custom_awaken.txt` 等 KV（改数值、换图标）
- `game/resource/addon_schinese.txt` / `addon_english.txt`（改技能文案）
- `docs/reference/` 升了 Dota 版本

**不要靠「哪些文件改了」判断要不要同步。** 18/38 的描述里带 `%占位符%`，改一个
`AbilityValues` 数值、一个字的本地化都不碰，玩家看到的描述照样会变。全量重生成只要几十毫秒，
直接跑，产物没变化脚本会告诉你。

## 步骤

1. **把 game 仓库切到 develop 并拉到最新**。脚本默认找与本仓库并列的
   `../windy10v10ai` 或 `../game`，其他位置用 `AWAKEN_GAME_REPO` 指绝对路径。
   **`HEAD` 不用自己记**，脚本会写进产物的 `AWAKEN_SOURCE.gameCommit`。
2. **取数**：`cd web && npm run awaken:sync`。纯离线，含七项自检。
3. **自检不过就停下**，把失败项原样报给用户，**不要猜着改产物**——自检拦住的多半是
   game 侧漏同步（比如加了觉醒英雄但忘了同步 `AwakenTab.tsx`），要回 game 仓库修。
4. **产物没变化就到此为止**，不开 PR。
5. **有变化且提示缺图**时跑 `npm run awaken:images`（要联网，需先
   `npm i sharp --no-save`），再跑一次第 2 步。
6. **写变更说明**：拿产物里**改动前**那一版的 `AWAKEN_SOURCE.gameCommit`（`git show HEAD:web/config/awaken.ts | head -10`），
   `git -C <game> log --oneline <旧SHA>..HEAD -- <相关路径>`。
   git 历史用来解释「为什么变了」，产物 diff 回答「变了什么」。
7. **校验**：`npm run awaken:test && npm run lint && npx tsc --noEmit && npm run build`。
8. **开 PR**：分支 `chore/awaken-sync-<日期>`，正文贴变更说明与产物 diff 摘要。

## 只认 develop 上的提交

脚本判断 `HEAD` 是不是 `origin/develop` 的祖先，不满足就停下不生成——feature 分支上的觉醒改动
还可能被推翻或改写，据此生成的产物没法追溯。报这个错就去 game 仓库切到 develop 并拉最新。

## 七项自检拦的是什么

失败时按这张表判断该回哪儿改：

| 报错 | 多半是 |
|------|------|
| 只解析出 N 个英雄，少于下限 | game 侧重构了 `AWAKEN_ABILITIES` 的写法，脚本的正则要跟着改 |
| AwakenTab.tsx 与 awaken-config.ts 的英雄对不上 | **game 侧漏同步**，回 game 修，不要改网站 |
| 限免标记与 FREE_TRIAL_HEROES 对不上 | 同上 |
| 缺 zh/en 标题或描述 | 新觉醒只写了中文，回 game 补另一种语言 |
| 有占位符取不到值 | 数值 key 改了名，或技能挪进了脚本没覆盖的 KV 文件 |
| 缺 zh/en 英雄名 | Dota 版本目录升级后 key 变了 |
| 没有立绘 | 先跑 `npm run awaken:images` |

图标取不到只告警不拦：页面按缺图占位渲染。目前钢背兽就是这种情况，处理计划见设计文档第 11 节。

## 不要做的事

- **不要手改 `web/config/awaken.ts` 或 `awaken-assets.json`**。它们是产物，下次同步会被覆盖。
- **不要为了让自检通过而放宽自检**。自检是这条链路唯一的安全网。
- **不要把 `sharp` 写进 `package.json`**。只有取图用得到，装进依赖会让每次部署都多背几十 MB。
- **不要动 `web/public/dota/` 里的文件名**。名字里的 hash 是缓存策略的基础，手改会让旧图永远刷不掉。
