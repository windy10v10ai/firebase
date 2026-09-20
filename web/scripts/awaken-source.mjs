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

/** KeyValues 转义：\n \t 还原成对应字符，\\ 还原成单个反斜杠，其余 \x 按引擎行为丢弃反斜杠 */
function unescapeKv(raw) {
  return raw.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
}

/** `"key" "value"` 扁平表，本地化文件用 */
function parseFlatKv(file) {
  const map = new Map();
  for (const m of readText(file).matchAll(/"([^"\r\n]+)"\s*"((?:[^"\\]|\\.)*)"/g)) {
    map.set(m[1], unescapeKv(m[2]));
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

/** KeyValues 文本解析成保序的 [key, value] 列表，value 是字符串或下一层列表 */
function parseKv(text) {
  const root = [];
  const stack = [root];
  let key = null;
  // 注释要和字符串一起按出现顺序吃掉：引号里的 // 不是注释，注释里的引号也不是字符串
  for (const m of text.matchAll(/"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*/g)) {
    const top = stack[stack.length - 1];
    if (m[2] === '{') {
      const child = [];
      top.push([key, child]);
      stack.push(child);
      key = null;
    } else if (m[2] === '}') {
      if (stack.length > 1) stack.pop();
      key = null;
    } else if (m[1] !== undefined) {
      if (key === null) {
        key = m[1];
      } else {
        top.push([key, m[1]]);
        key = null;
      }
    }
  }
  return root;
}

/** 这几项在游戏提示框里有专门的位置或不展示，不当成数值行 */
const NON_VALUE_KEYS = new Set(['AbilityCooldown', 'AbilityManaCost']);
/** 顶层写法里也要当数值行处理的字段 */
const TOP_LEVEL_VALUE_KEYS = ['AbilityCharges', 'AbilityChargeRestoreTime'];

/**
 * 合并一个技能在各来源里的 KV：低优先级先铺、高优先级覆盖，行的顺序以最先出现的写法为准。
 * 返回顶层字符串字段与 AbilityValues 各项（value 与同块的标记，如 affected_by_aoe_increase）。
 */
function abilityKv(bodies) {
  const top = new Map();
  const values = new Map();
  for (const body of [...bodies].reverse()) {
    const [[, fields]] = parseKv(`${body}}`);
    for (const [key, value] of fields) {
      if (typeof value === 'string') {
        top.set(key, value);
      } else if (key === 'AbilityValues') {
        for (const [name, entry] of value) {
          if (typeof entry === 'string') {
            values.set(name, { value: entry, flags: new Map() });
          } else {
            const flags = new Map(entry.filter(([, v]) => typeof v === 'string'));
            // 天赋、神杖只改写加成键不重写 value 时，沿用低优先级来源里的基础值
            const value = flags.get('value') ?? values.get(name)?.value;
            if (value !== undefined) values.set(name, { value, flags });
          }
        }
      }
    }
  }
  return { top, values };
}

const splitLevels = (raw) => raw.trim().split(/\s+/);

/** 游戏提示框的「技能」一栏只显示一种，特殊形态优先于指向方式 */
const BEHAVIOR_ORDER = [
  ['TOGGLE', 'toggle'],
  ['CHANNELLED', 'channeled'],
  ['AUTOCAST', 'autocast'],
  ['AURA', 'aura'],
  ['PASSIVE', 'passive'],
];

function behaviorOf(raw) {
  if (!raw) return null;
  const flags = new Set(raw.split('|').map((f) => f.trim().replace('DOTA_ABILITY_BEHAVIOR_', '')));
  for (const [flag, name] of BEHAVIOR_ORDER) {
    if (flags.has(flag)) return name;
  }
  if (flags.has('UNIT_TARGET') && flags.has('POINT')) return 'unitOrPoint';
  if (flags.has('UNIT_TARGET')) return 'target';
  if (flags.has('POINT')) return 'point';
  if (flags.has('NO_TARGET')) return 'noTarget';
  return null;
}

function targetingOf(team, type) {
  if (!team) return null;
  const heroesOnly = !!type && type.includes('HERO') && !type.includes('BASIC');
  if (team.includes('ENEMY')) return type ? (heroesOnly ? 'enemyHeroes' : 'enemyUnits') : 'enemy';
  if (team.includes('FRIENDLY')) return type ? (heroesOnly ? 'alliedHeroes' : 'alliedUnits') : 'allies';
  if (team.includes('BOTH')) return heroesOnly ? 'heroes' : 'units';
  return null;
}

const DAMAGE_TYPES = {
  DAMAGE_TYPE_PHYSICAL: 'physical',
  DAMAGE_TYPE_MAGICAL: 'magical',
  DAMAGE_TYPE_PURE: 'pure',
};

function immunityOf(raw) {
  if (!raw) return null;
  if (raw === 'SPELL_IMMUNITY_ALLIES_YES_ENEMIES_NO') return 'alliesYesEnemiesNo';
  return raw.endsWith('_YES') ? 'yes' : raw.endsWith('_NO') ? 'no' : null;
}

const DISPELLABLE = {
  SPELL_DISPELLABLE_YES_STRONG: 'strong',
  SPELL_DISPELLABLE_YES: 'soft',
  SPELL_DISPELLABLE_NO: 'no',
};

/**
 * 按游戏提示框的规则挑出要展示的数值行：没有本地化标签的是脚本内部参数，
 * 各级全为 0 的只在天赋神杖生效后才有值，神杖、魔晶专属的同样要拥有后才显示。
 */
function valueRows(abilityName, kv, labelOf, damageType) {
  const candidates = [
    ...[...kv.values].filter(([name]) => !NON_VALUE_KEYS.has(name)),
    ...TOP_LEVEL_VALUE_KEYS.filter((name) => kv.top.has(name) && !kv.values.has(name)).map(
      (name) => [name, { value: kv.top.get(name), flags: new Map() }],
    ),
  ];
  const rows = [];
  for (const [name, { value, flags }] of candidates) {
    if (flags.get('RequiresScepter') === '1' || flags.get('RequiresShard') === '1') continue;
    const levels = splitLevels(value);
    if (levels.every((v) => Number(v) === 0)) continue;
    const label = labelOf(`DOTA_Tooltip_ability_${abilityName}_${name}`);
    const zh = label.zh.trim();
    const en = label.en.trim();
    if (!zh || !en) continue;

    const percent = zh.startsWith('%');
    const amp = flags.get('CalculateSpellDamageTooltip');
    rows.push({
      label: { zh: zh.replace(/^%\s*/, ''), en: en.replace(/^%\s*/, '') },
      levels: new Set(levels).size === 1 ? [levels[0]] : levels,
      percent,
      aoe: flags.get('affected_by_aoe_increase') === '1',
      // 没写标记时的默认：法术、纯粹伤害技能里名字带 damage 的定值吃技能增强，百分比多是伤害加深之类的系数
      spellAmp:
        amp === '1' ||
        (amp === undefined &&
          !percent &&
          (damageType === 'magical' || damageType === 'pure') &&
          name.toLowerCase().includes('damage')),
    });
  }
  return rows;
}

const levelsOrNull = (raw) => (raw && splitLevels(raw).some((v) => Number(v) !== 0) ? splitLevels(raw) : null);

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
  // 引擎查本地化不分大小写，game 与原版文件里 ability / Ability 两种写法都有
  const lowered = {};
  for (const [lang, src] of Object.entries(locales)) {
    lowered[lang] = [src.addon, src.reference].map(
      (map) => new Map([...map].map(([k, v]) => [k.toLowerCase(), v])),
    );
  }
  const labelOf = (key) => {
    const out = {};
    for (const [lang, maps] of Object.entries(lowered)) {
      out[lang] = maps.map((map) => map.get(key.toLowerCase())).find((v) => v !== undefined) ?? '';
    }
    return out;
  };

  const unresolved = [];
  const heroes = display.map((entry) => {
    const bodies = bodiesByAbility.get(entry.abilityName) ?? [];
    const kv = abilityKv(bodies);
    const values = new Map([...kv.values].map(([name, { value }]) => [name, value]));
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
      // 一次从左到右扫完：%% 是百分号的转义，先替换占位符再还原转义会把「%value%%%」拆错
      const desc = raw.replace(/%([A-Za-z0-9_]*)%/g, (whole, name) => {
        if (name === '') return '%';
        const value = values.get(name) ?? values.get(name.replace(/_tooltip$/, ''));
        if (value === undefined) {
          unresolved.push(`${entry.abilityName} 的 %${name}%`);
          return whole;
        }
        return value;
      });
      // 标题、描述都走 GameText 渲染，只认 <br>，本地化里的换行在这里统一转换
      text[lang] = {
        heroName: src.addon.get(entry.heroName) ?? src.reference.get(`${entry.heroName}:n`) ?? '',
        title: title.replace(/\n/g, '<br>'),
        desc: desc.replace(/\n/g, '<br>'),
      };
    }

    const damageType = DAMAGE_TYPES[kv.top.get('AbilityUnitDamageType')] ?? null;
    const lore = labelOf(`${key}_Lore`);
    const ability = {
      behavior: behaviorOf(kv.top.get('AbilityBehavior')),
      targeting: targetingOf(kv.top.get('AbilityUnitTargetTeam'), kv.top.get('AbilityUnitTargetType')),
      damageType,
      piercesImmunity: immunityOf(kv.top.get('SpellImmunityType')),
      dispellable: DISPELLABLE[kv.top.get('SpellDispellableType')] ?? null,
      values: valueRows(entry.abilityName, kv, labelOf, damageType),
      cooldown: levelsOrNull(kv.values.get('AbilityCooldown')?.value ?? kv.top.get('AbilityCooldown')),
      manaCost: levelsOrNull(kv.values.get('AbilityManaCost')?.value ?? kv.top.get('AbilityManaCost')),
      lore: lore.zh && lore.en ? lore : null,
    };

    return {
      heroName: entry.heroName,
      abilityName: entry.abilityName,
      freeTrial: freeTrialHeroes.includes(entry.heroName),
      freeTrialInTab: entry.freeTrialInTab,
      texture,
      text,
      ability,
    };
  });

  return { game, version, heroes, replacementHeroes, freeTrialHeroes, unresolved };
}

/**
 * 记进产物头部，供下次同步时 `git log <旧SHA>..HEAD` 生成变更说明。
 * `onDevelop` 判断的是提交在不在 origin/develop 上，不是分支叫不叫 develop——
 * 分支名在 detached HEAD 下只会得到 "HEAD"，而同步脚本从 worktree 跑是常态。
 */
export function gameHead(game) {
  const run = (...args) =>
    execFileSync('git', ['-C', game, ...args], { encoding: 'utf8' }).trim();
  const commit = run('rev-parse', 'HEAD');
  let onDevelop = false;
  try {
    execFileSync('git', ['-C', game, 'merge-base', '--is-ancestor', commit, 'origin/develop'], {
      stdio: 'ignore',
    });
    onDevelop = true;
  } catch {
    // 不是祖先，或本地根本没有 origin/develop
  }
  return { commit, onDevelop };
}
