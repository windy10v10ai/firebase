import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAbilityReader,
  gameHead,
  resolveDotaVersion,
  resolveGameRepo,
} from './dota-ability.mjs';

/**
 * 从 game 仓库重新生成百科的数据 web/config/wiki-abilities.json、wiki-items.json。
 * 名单与档位读抽选池，提示框数据与觉醒页同一套取数规则；名字与图标查 config/abilities.json、items.json，不重复存。
 *
 * 跑法：cd web && npm run wiki:sync
 */

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');
const LANGS = ['zh', 'en', 'ru'];
// 物品池最高到 T7，游戏里只看得出五种颜色，网站照玩家看到的并成五档
const MAX_TIER = 5;

const KINDS = {
  abilities: {
    pool: 'src/vscripts/modules/lottery/ability/lottery-abilities.ts',
    groups: { abilityTiersActive: 'active', abilityTiersPassive: 'passive' },
    min: 150,
    // 技能都有描述；物品里纯加属性的那些游戏里本来就只有数值
    needsDesc: true,
  },
  items: {
    pool: 'src/vscripts/modules/lottery/item/lottery-items.ts',
    groups: { itemTiers: 'all' },
    min: 40,
    needsDesc: false,
  },
};

/** 按行扫抽选池：注释掉的条目不在池里，同一条出现在多个档位时按先出现的高档位算 */
function readPool(file, groups) {
  const entries = [];
  const duplicates = [];
  const seen = new Set();
  let group = null;
  let tier = null;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\/\/.*$/, '');
    const declared = line.match(/export const (\w+)/);
    if (declared) group = groups[declared[1]] ?? null;
    if (!group) continue;
    const level = line.match(/level:\s*(\d+)/);
    if (level) tier = Math.min(Number(level[1]), MAX_TIER);
    for (const m of line.matchAll(/'([a-z0-9_]+)'/g)) {
      if (seen.has(m[1])) {
        duplicates.push(m[1]);
        continue;
      }
      seen.add(m[1]);
      entries.push({ name: m[1], group, tier });
    }
  }
  return { entries, duplicates };
}

function check(kind, entries, unresolved, assets) {
  const errors = [];
  const { min, needsDesc } = KINDS[kind];
  if (entries.length < min) {
    errors.push(`${kind} 只解析出 ${entries.length} 条，少于下限 ${min}，多半是解析失效了`);
  }
  for (const entry of entries) {
    if (!entry.found) errors.push(`${entry.name} 在 KV 里找不到`);
    if (!assets[entry.name])
      errors.push(`${entry.name} 不在 config/${kind}.json，先跑 npm run items`);
    if (entry.tier === null) errors.push(`${entry.name} 读不出档位`);
    if (needsDesc) {
      for (const lang of ['zh', 'en']) {
        if (!entry.desc[lang]) errors.push(`${entry.name} 缺 ${lang} 描述`);
      }
    } else if (!entry.desc.en && entry.ability.values.length === 0) {
      errors.push(`${entry.name} 既没有描述也没有数值，提示框会是空的`);
    }
    for (const lang of LANGS) {
      if (entry.desc[lang].includes('\\'))
        errors.push(`${entry.name} 的 ${lang} 描述残留反斜杠转义`);
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

function build(game, version, kind) {
  const { entries, duplicates } = readPool(path.join(game, KINDS[kind].pool), KINDS[kind].groups);
  const reader = createAbilityReader(game, version, LANGS, kind);
  const assets = JSON.parse(fs.readFileSync(path.join(WEB, `config/${kind}.json`), 'utf8'));
  const rows = entries.map((entry) => {
    const { found, text, ability } = reader.read(entry.name);
    const desc = {};
    for (const lang of LANGS) desc[lang] = text[lang].desc;
    return { ...entry, found, desc, ability };
  });
  for (const name of duplicates)
    console.warn(`告警：${name} 在抽选池里出现了不止一次，按最高档位算`);
  return { rows, errors: check(kind, rows, reader.unresolved, assets) };
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

  const built = Object.keys(KINDS).map((kind) => ({ kind, ...build(game, version, kind) }));
  const errors = built.flatMap((b) => b.errors);
  if (errors.length) {
    console.error('自检未通过，没有生成任何文件：');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  for (const { kind, rows } of built) {
    const out = path.join(WEB, `config/wiki-${kind}.json`);
    const next = `${JSON.stringify(
      {
        source: { gameCommit: head.commit, dotaVersion: version },
        [kind]: rows.map(({ found: _found, ...rest }) => rest),
      },
      null,
      2,
    )}\n`;
    const changed = !fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== next;
    fs.writeFileSync(out, next);
    console.log(
      `${kind} ${rows.length} 条，Dota ${version}，` +
        `game develop@${head.commit.slice(0, 9)} → ${changed ? '产物有变化' : '产物无变化'}`,
    );
  }
}

main();
