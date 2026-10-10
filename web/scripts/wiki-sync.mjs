import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAbilityReader, gameHead, resolveDotaVersion, resolveGameRepo } from './dota-ability.mjs';

/**
 * 从 game 仓库重新生成 wiki 技能页的数据 web/config/wiki-abilities.json。
 * 名单与档位读抽选池，提示框数据与觉醒页同一套取数规则；名字与图标查 config/abilities.json，不重复存。
 *
 * 跑法：cd web && npm run wiki:sync
 */

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');
const OUT = path.join(WEB, 'config/wiki-abilities.json');
const ASSETS = path.join(WEB, 'config/abilities.json');
const POOL_FILE = 'src/vscripts/modules/lottery/ability/lottery-abilities.ts';
const POOLS = { abilityTiersActive: 'active', abilityTiersPassive: 'passive' };
const LANGS = ['zh', 'en', 'ru'];

const MIN_ABILITIES = 150;

/** 按行扫抽选池：注释掉的条目不在池里，同一技能出现在多个档位时按先出现的高档位算 */
function readPool(file) {
  const entries = [];
  const duplicates = [];
  const seen = new Set();
  let pool = null;
  let tier = null;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\/\/.*$/, '');
    const declared = line.match(/export const (\w+)/);
    if (declared) pool = POOLS[declared[1]] ?? null;
    if (!pool) continue;
    const level = line.match(/level:\s*(\d+)/);
    if (level) tier = Number(level[1]);
    for (const m of line.matchAll(/'([a-z0-9_]+)'/g)) {
      if (seen.has(m[1])) {
        duplicates.push(m[1]);
        continue;
      }
      seen.add(m[1]);
      entries.push({ name: m[1], pool, tier });
    }
  }
  return { entries, duplicates };
}

function check(abilities, unresolved, assets) {
  const errors = [];
  if (abilities.length < MIN_ABILITIES) {
    errors.push(`只解析出 ${abilities.length} 个技能，少于下限 ${MIN_ABILITIES}，多半是解析失效了`);
  }
  for (const entry of abilities) {
    if (!entry.found) errors.push(`${entry.name} 在 KV 里找不到`);
    if (!assets[entry.name]) errors.push(`${entry.name} 不在 config/abilities.json，先跑 npm run items`);
    if (entry.tier === null) errors.push(`${entry.name} 读不出档位`);
    for (const lang of ['zh', 'en']) {
      if (!entry.desc[lang]) errors.push(`${entry.name} 缺 ${lang} 描述`);
    }
    for (const lang of LANGS) {
      if (entry.desc[lang].includes('\\')) errors.push(`${entry.name} 的 ${lang} 描述残留反斜杠转义`);
      if (entry.ability.lore?.[lang].includes('\\')) {
        errors.push(`${entry.name} 的 ${lang} 背景故事残留反斜杠转义`);
      }
    }
  }
  if (unresolved.length) {
    errors.push(`有占位符取不到值：${[...new Set(unresolved)].join('、')}`);
  }
  return errors;
}

function main() {
  const game = resolveGameRepo(REPO);
  const version = resolveDotaVersion(game);
  const head = gameHead(game);
  // feature 分支上的改动还可能被推翻或改写，据此生成的产物无从追溯
  if (!head.onDevelop) {
    console.error(
      `game 的 ${head.commit.slice(0, 9)} 不在 origin/develop 上，没有生成任何文件。\n` +
        '  先把 game 仓库切到 develop 并 git pull。',
    );
    process.exit(1);
  }

  const { entries, duplicates } = readPool(path.join(game, POOL_FILE));
  const reader = createAbilityReader(game, version, LANGS);
  const assets = JSON.parse(fs.readFileSync(ASSETS, 'utf8'));

  const abilities = entries.map((entry) => {
    const { found, text, ability } = reader.read(entry.name);
    const desc = {};
    for (const lang of LANGS) desc[lang] = text[lang].desc;
    return { ...entry, found, desc, ability };
  });

  for (const name of duplicates) console.warn(`告警：${name} 在抽选池里出现了不止一次，按最高档位算`);
  const errors = check(abilities, reader.unresolved, assets);
  if (errors.length) {
    console.error('自检未通过，没有生成任何文件：');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const out = {
    source: { gameCommit: head.commit, dotaVersion: version },
    abilities: abilities.map(({ found: _found, ...rest }) => rest),
  };
  const next = `${JSON.stringify(out, null, 2)}\n`;
  const changed = !fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== next;
  fs.writeFileSync(OUT, next);

  console.log(
    `${abilities.length} 个技能，Dota ${version}，` +
      `game develop@${head.commit.slice(0, 9)} → ${changed ? '产物有变化' : '产物无变化'}`,
  );
}

main();
