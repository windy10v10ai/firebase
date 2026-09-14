import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gameHead, loadAwakenSource } from './awaken-source.mjs';

/**
 * 从 game 仓库重新生成 web/config/awaken.ts。
 *
 * 全量重生成，不做增量检测：输入全部读一遍只要几十毫秒，而「哪些改动会影响产物」
 * 枚举不全就是静默错误——改一个 AbilityValues 数值不碰任何本地化文件，
 * 玩家看到的描述照样会变（18/38 的描述里带 %占位符%）。
 *
 * 跑法：cd web && npm run awaken:sync
 */

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');
const OUT = path.join(WEB, 'config/awaken.ts');
const MANIFEST = path.join(WEB, 'config/awaken-assets.json');

const MIN_HEROES = 30;

/** 七项自检，任一项不过就停下，不生成半成品 */
function check(source, assets) {
  const errors = [];
  const { heroes, replacementHeroes, unresolved } = source;

  // 1. 条目数下限：正则失效时会解析出空表，只靠交叉校验的话「两边都空」也会通过
  if (heroes.length < MIN_HEROES) {
    errors.push(`只解析出 ${heroes.length} 个英雄，少于下限 ${MIN_HEROES}，多半是解析失效了`);
  }

  // 2. 展示表与替换表的英雄集合必须一致——这是两个文件、两套正则的互相印证
  const displaySet = new Set(heroes.map((h) => h.heroName));
  const replacementSet = new Set(replacementHeroes);
  const onlyInTab = [...displaySet].filter((h) => !replacementSet.has(h));
  const onlyInConfig = [...replacementSet].filter((h) => !displaySet.has(h));
  if (onlyInTab.length || onlyInConfig.length) {
    errors.push(
      'AwakenTab.tsx 与 awaken-config.ts 的英雄对不上（game 侧漏同步）：' +
        `只在 Tab 里 [${onlyInTab.join(', ')}]，只在 config 里 [${onlyInConfig.join(', ')}]`,
    );
  }

  // 3. 限免名单同理，Tab 里那份 freeTrial 是手抄的副本
  const mismatched = heroes.filter((h) => h.freeTrial !== h.freeTrialInTab).map((h) => h.heroName);
  if (mismatched.length) {
    errors.push(`限免标记与 FREE_TRIAL_HEROES 对不上：${mismatched.join(', ')}`);
  }

  // 4. 中英文的标题与描述都要有
  for (const hero of heroes) {
    for (const [lang, text] of Object.entries(hero.text)) {
      if (!text.title) errors.push(`${hero.abilityName} 缺 ${lang} 标题`);
      if (!text.desc) errors.push(`${hero.abilityName} 缺 ${lang} 描述`);
    }
  }

  // 5. 占位符全部要取到值，否则玩家会看到 %radius% 这样的原文
  if (unresolved.length) {
    errors.push(`有占位符取不到值：${[...new Set(unresolved)].join('、')}`);
  }

  // 6. 英雄名中英文都要有
  for (const hero of heroes) {
    for (const [lang, text] of Object.entries(hero.text)) {
      if (!text.heroName) errors.push(`${hero.heroName} 缺 ${lang} 英雄名`);
    }
  }

  // 7. 立绘必须有；图标缺了只告警，页面按缺图占位渲染
  const warnings = [];
  for (const hero of heroes) {
    if (!assets.art[hero.heroName]) {
      errors.push(`${hero.heroName} 没有立绘，先跑 npm run awaken:images`);
    }
    if (!assets.icons[hero.texture]) {
      warnings.push(`${hero.heroName} 的图标 ${hero.texture} 取不到，页面按缺图占位渲染`);
    }
  }

  return { errors, warnings };
}

const quote = (value) => JSON.stringify(value);

function render(source, assets, head) {
  const rows = source.heroes
    .map((hero) => {
      const icon = assets.icons[hero.texture] ?? null;
      const fields = [
        `heroName: ${quote(hero.heroName)}`,
        `abilityName: ${quote(hero.abilityName)}`,
        `freeTrial: ${hero.freeTrial}`,
        `art: ${quote(assets.art[hero.heroName])}`,
        `icon: ${icon === null ? 'null' : quote(icon)}`,
        `name: { zh: ${quote(hero.text.zh.heroName)}, en: ${quote(hero.text.en.heroName)} }`,
        `title: { zh: ${quote(hero.text.zh.title)}, en: ${quote(hero.text.en.title)} }`,
        `desc: { zh: ${quote(hero.text.zh.desc)}, en: ${quote(hero.text.en.desc)} }`,
      ];
      return `  {\n${fields.map((f) => `    ${f},`).join('\n')}\n  },`;
    })
    .join('\n');

  return `// 本文件由 web/scripts/awaken-sync.mjs 生成，不要手改。
// 改觉醒数据要改 game 仓库，再跑 npm run awaken:sync 重新生成。
// 数据来源与同步流程见 docs/design/web/phase-3b-awaken-page.md。

/** 生成时 game 仓库的位置，下次同步时用它算出变更说明。必定是 develop 上的提交 */
export const AWAKEN_SOURCE = {
  gameCommit: ${quote(head.commit)},
  dotaVersion: ${quote(source.version)},
} as const;

export interface AwakenText {
  zh: string;
  en: string;
}

export interface AwakenHero {
  /** npc_dota_hero_xxx，接口收发用的就是它 */
  heroName: string;
  abilityName: string;
  /** 限时免费体验：选这个英雄自动觉醒，不用解锁 */
  freeTrial: boolean;
  /** public/dota/ 下的立绘文件名，带内容 hash */
  art: string;
  /** public/dota/ 下的技能图标文件名；null 表示还没有图，页面渲染占位 */
  icon: string | null;
  name: AwakenText;
  /** 技能标题，原样保留 game 本地化里的 <font> 标记 */
  title: AwakenText;
  /** 技能完整描述，%占位符% 已在生成时换成真实数值 */
  desc: AwakenText;
}

/** 顺序照 game 的 AWAKEN_ABILITIES，新上线的觉醒排最前 */
export const AWAKEN_HEROES: AwakenHero[] = [
${rows}
];

export const AWAKEN_HERO_COUNT = AWAKEN_HEROES.length;
`;
}

function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.error(`缺少图片清单 ${path.relative(REPO, MANIFEST)}，先跑 npm run awaken:images`);
    process.exit(1);
  }
  const assets = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const source = loadAwakenSource(REPO);
  const { errors, warnings } = check(source, assets);

  for (const warning of warnings) console.warn(`告警：${warning}`);
  if (errors.length) {
    console.error('自检未通过，没有生成任何文件：');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const head = gameHead(source.game);
  // feature 分支上的改动还可能被推翻或改写，据此生成的产物无从追溯
  if (!head.onDevelop) {
    console.error(
      `game 的 ${head.commit.slice(0, 9)} 不在 origin/develop 上，没有生成任何文件。\n` +
        '  先把 game 仓库切到 develop 并 git pull。',
    );
    process.exit(1);
  }

  const next = render(source, assets, head);
  const changed = !fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== next;
  fs.writeFileSync(OUT, next);

  console.log(
    `${source.heroes.length} 个英雄，Dota ${source.version}，` +
      `game develop@${head.commit.slice(0, 9)} → ${changed ? '产物有变化' : '产物无变化'}`,
  );
}

main();
