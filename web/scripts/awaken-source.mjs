import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 从 game 仓库读出觉醒数据。取数与取图共用这一份解析，保证两边看到的是同一张表。
 * 纯 node，不依赖任何包，所以取数那一步可以离线跑在 CI 里。
 */

/** game 仓库位置：优先环境变量，其次与本仓库并列的两个常见目录名 */
export function resolveGameRepo(repoRoot) {
  const fromEnv = process.env.AWAKEN_GAME_REPO;
  const candidates = fromEnv
    ? [fromEnv]
    : [path.resolve(repoRoot, '../windy10v10ai'), path.resolve(repoRoot, '../game')];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'src/vscripts/modules/awaken/awaken-config.ts'))) {
      return dir;
    }
  }
  throw new Error(
    `找不到 game 仓库。试过：${candidates.join('、')}\n用 AWAKEN_GAME_REPO 指定绝对路径再跑。`,
  );
}

/** docs/reference 下最新的数字版本目录，不写死版本号 */
export function resolveDotaVersion(game) {
  const dir = path.join(game, 'docs/reference');
  const versions = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d+\.\d+$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => Number(a) - Number(b));
  if (versions.length === 0) {
    throw new Error(`${dir} 下没有数字版本目录`);
  }
  return versions[versions.length - 1];
}

const readText = (file) => fs.readFileSync(file, 'utf8');

/** KeyValues 里一个块的范围：从 `"name"\n{` 起，配平花括号为止 */
function blockBodies(text) {
  const out = [];
  for (const m of text.matchAll(/"([A-Za-z0-9_]+)"\s*\r?\n\s*\{/g)) {
    let i = m.index + m[0].length - 1;
    let depth = 0;
    let j = i;
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push([m[1], text.slice(i, j)]);
  }
  return out;
}

/** `"key" "value"` 扁平表，本地化文件用 */
function parseFlatKv(file) {
  const map = new Map();
  for (const m of readText(file).matchAll(/"([^"\r\n]+)"\s*"((?:[^"\\]|\\.)*)"/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

/**
 * 技能 KV 的取值来源，顺序即优先级：自定义觉醒 → 自定义 → 抽奖 → override → 原版合并本 → 原版按英雄。
 * 最后一项不能省：炸弹人的 attack_range_tooltip 只在 heroes/npc_dota_hero_techies.txt 里。
 */
export function kvSourceFiles(game, version) {
  const heroDir = path.join(game, `docs/reference/${version}/heroes`);
  return [
    path.join(game, 'game/scripts/npc/npc_abilities_custom_awaken.txt'),
    path.join(game, 'game/scripts/npc/npc_abilities_custom.txt'),
    path.join(game, 'game/scripts/npc/npc_abilities_custom_lottery.txt'),
    path.join(game, 'game/scripts/npc/npc_abilities_override.txt'),
    path.join(game, `docs/reference/${version}/npc_abilities.txt`),
    ...fs.readdirSync(heroDir).filter((f) => f.endsWith('.txt')).map((f) => path.join(heroDir, f)),
  ];
}

export function localeSourceFiles(game, version) {
  return {
    zh: {
      addon: path.join(game, 'game/resource/addon_schinese.txt'),
      reference: path.join(game, `docs/reference/${version}/abilities_schinese.txt`),
    },
    en: {
      addon: path.join(game, 'game/resource/addon_english.txt'),
      reference: path.join(game, `docs/reference/${version}/abilities_english.txt`),
    },
  };
}

export function tsSourceFiles(game) {
  return {
    tab: path.join(game, 'src/panorama/react/hud_main/pages/profile/tabs/AwakenTab.tsx'),
    config: path.join(game, 'src/vscripts/modules/awaken/awaken-config.ts'),
  };
}

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

/** 把一个技能的 AbilityValues / AbilitySpecial 摊平成 key → 值 */
function abilityValues(bodies) {
  const out = new Map();
  for (const body of bodies) {
    for (const m of body.matchAll(/"(AbilityValues|AbilitySpecial)"\s*\r?\n\s*\{/g)) {
      let i = m.index + m[0].length - 1;
      let depth = 0;
      let j = i;
      for (; j < body.length; j++) {
        if (body[j] === '{') depth++;
        else if (body[j] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      const inner = body.slice(i, j);
      for (const kv of inner.matchAll(/"([A-Za-z0-9_]+)"\s+"([^"]*)"/g)) {
        if (!out.has(kv[1])) out.set(kv[1], kv[2]);
      }
      // "key" { "value" "x" } 这种嵌套写法
      for (const kv of inner.matchAll(/"([A-Za-z0-9_]+)"\s*\r?\n\s*\{([^{}]*)\}/g)) {
        const v = kv[2].match(/"value"\s+"([^"]*)"/i);
        if (v && !out.has(kv[1])) out.set(kv[1], v[1]);
      }
    }
  }
  return out;
}

/** 读齐所有来源，产出结构化的觉醒数据；不做校验，校验在 awaken-sync 里 */
export function loadAwakenSource(repoRoot) {
  const game = resolveGameRepo(repoRoot);
  const version = resolveDotaVersion(game);
  const ts = tsSourceFiles(game);

  const display = parseDisplayList(ts.tab);
  const { replacementHeroes, freeTrialHeroes } = parseAwakenConfig(ts.config);

  const bodiesByAbility = new Map();
  for (const file of kvSourceFiles(game, version)) {
    for (const [name, body] of blockBodies(readText(file))) {
      if (!bodiesByAbility.has(name)) bodiesByAbility.set(name, []);
      bodiesByAbility.get(name).push(body);
    }
  }

  const locales = {};
  for (const [lang, files] of Object.entries(localeSourceFiles(game, version))) {
    locales[lang] = { addon: parseFlatKv(files.addon), reference: parseFlatKv(files.reference) };
  }

  const unresolved = [];
  const heroes = display.map((entry) => {
    const bodies = bodiesByAbility.get(entry.abilityName) ?? [];
    const values = abilityValues(bodies);
    const textureMatch = bodies
      .map((b) => b.match(/"AbilityTextureName"\s*"([^"]+)"/))
      .find(Boolean);
    // 没写 AbilityTextureName 的原版技能，引擎按技能名找同名图标
    const texture = textureMatch ? textureMatch[1] : entry.abilityName;

    const key = `DOTA_Tooltip_ability_${entry.abilityName}`;
    const text = {};
    for (const [lang, src] of Object.entries(locales)) {
      const title = src.addon.get(key) ?? '';
      const raw = src.addon.get(`${key}_Description`) ?? '';
      const desc = raw.replace(/%([A-Za-z0-9_]+)%/g, (whole, name) => {
        const value = values.get(name) ?? values.get(name.replace(/_tooltip$/, ''));
        if (value === undefined) {
          unresolved.push(`${entry.abilityName} 的 %${name}%`);
          return whole;
        }
        return value;
      });
      text[lang] = {
        heroName: src.addon.get(entry.heroName) ?? src.reference.get(`${entry.heroName}:n`) ?? '',
        title,
        desc,
      };
    }

    return {
      heroName: entry.heroName,
      abilityName: entry.abilityName,
      freeTrial: freeTrialHeroes.includes(entry.heroName),
      freeTrialInTab: entry.freeTrialInTab,
      texture,
      text,
    };
  });

  return { game, version, heroes, replacementHeroes, freeTrialHeroes, unresolved };
}

/** 记进产物头部，供下次同步时 `git log <旧SHA>..HEAD` 生成变更说明 */
export function gameHead(game) {
  const run = (...args) =>
    execFileSync('git', ['-C', game, ...args], { encoding: 'utf8' }).trim();
  return { commit: run('rev-parse', 'HEAD'), branch: run('rev-parse', '--abbrev-ref', 'HEAD') };
}
