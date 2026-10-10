import fs from 'node:fs';
import path from 'node:path';

import { createAbilityReader, resolveDotaVersion, resolveGameRepo } from './dota-ability.mjs';

/**
 * 从 game 仓库读出觉醒数据。取数与取图共用这一份解析，保证两边看到的是同一张表。
 */

function tsSourceFiles(game) {
  return {
    tab: path.join(game, 'src/panorama/react/hud_main/pages/profile/tabs/AwakenTab.tsx'),
    config: path.join(game, 'src/vscripts/modules/awaken/awaken-config.ts'),
  };
}

const readText = (file) => fs.readFileSync(file, 'utf8');

/** AwakenTab.tsx 的 AWAKEN_ABILITIES：展示用的英雄顺序与每个英雄展示哪个技能 */
function parseDisplayList(file) {
  const text = readText(file);
  const start = text.indexOf('const AWAKEN_ABILITIES');
  if (start < 0) throw new Error(`${file} 里找不到 AWAKEN_ABILITIES`);
  const body = text.slice(start, text.indexOf('\n];', start));
  const out = [];
  for (const m of body.matchAll(/\{[^{}]*\}/gs)) {
    const hero = m[0].match(/heroName:\s*'([^']+)'/);
    const ability = m[0].match(/abilityName:\s*'([^']+)'/);
    if (hero && ability) {
      out.push({
        heroName: hero[1],
        abilityName: ability[1],
        freeTrialInTab: m[0].includes('freeTrial: true'),
      });
    }
  }
  return out;
}

/** awaken-config.ts：替换表里出现过的英雄（去重）与限免名单 */
function parseAwakenConfig(file) {
  const text = readText(file);
  const replacementHeroes = [
    ...new Set([...text.matchAll(/heroName:\s*'([^']+)'/g)].map((m) => m[1])),
  ];
  const start = text.indexOf('FREE_TRIAL_HEROES');
  const freeTrialBody = text.slice(start, text.indexOf('\n];', start));
  const freeTrialHeroes = [...freeTrialBody.matchAll(/'(npc_dota_hero_[a-z_]+)'/g)].map((m) => m[1]);
  return { replacementHeroes, freeTrialHeroes };
}

/** 读齐所有来源，产出结构化的觉醒数据；不做校验，校验在 awaken-sync 里 */
export function loadAwakenSource(repoRoot) {
  const game = resolveGameRepo(repoRoot);
  const version = resolveDotaVersion(game);
  const ts = tsSourceFiles(game);

  const display = parseDisplayList(ts.tab);
  const { replacementHeroes, freeTrialHeroes } = parseAwakenConfig(ts.config);
  const reader = createAbilityReader(game, version, ['zh', 'en']);

  const heroes = display.map((entry) => {
    const { texture, text, ability } = reader.read(entry.abilityName);
    const heroText = {};
    for (const [lang, src] of Object.entries(reader.locales)) {
      heroText[lang] = {
        heroName: src.addon.get(entry.heroName) ?? src.reference.get(`${entry.heroName}:n`) ?? '',
        ...text[lang],
      };
    }
    return {
      heroName: entry.heroName,
      abilityName: entry.abilityName,
      freeTrial: freeTrialHeroes.includes(entry.heroName),
      freeTrialInTab: entry.freeTrialInTab,
      texture,
      text: heroText,
      ability,
    };
  });

  return { game, version, heroes, replacementHeroes, freeTrialHeroes, unresolved: reader.unresolved };
}
