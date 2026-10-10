import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 从 game 仓库读出技能提示框要的数据，觉醒页与 wiki 共用。取数规则见 docs/web/ability-tooltip.md 第 5 节。
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

/** docs/reference 下最新的版本目录，不写死版本号；Valve 的小版本带字母后缀，如 7.41f */
export function resolveDotaVersion(game) {
  const dir = path.join(game, 'docs/reference');
  const versions = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d+\.\d+[a-z]?$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (versions.length === 0) {
    throw new Error(`${dir} 下没有版本目录`);
  }
  return versions[versions.length - 1];
}

export const readText = (file) => fs.readFileSync(file, 'utf8');

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
export function parseFlatKv(file) {
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
function kvSourceFiles(game, version) {
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

const LOCALE_FILES = { zh: 'schinese', en: 'english', ru: 'russian' };

function localeSourceFiles(game, version, lang) {
  return {
    addon: path.join(game, `game/resource/addon_${LOCALE_FILES[lang]}.txt`),
    reference: path.join(game, `docs/reference/${version}/abilities_${LOCALE_FILES[lang]}.txt`),
  };
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

/** 中英文是必有的两份；其余语言缺译时落英文，与网站「没译到回落英文」同一口径 */
function withFallback(text) {
  const out = {};
  for (const [lang, value] of Object.entries(text)) out[lang] = value || text.en;
  return out;
}

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
    const raw = labelOf(`DOTA_Tooltip_ability_${abilityName}_${name}`);
    const label = {};
    for (const [lang, text] of Object.entries(raw)) label[lang] = text.trim();
    if (!label.zh || !label.en) continue;

    const percent = label.zh.startsWith('%');
    const amp = flags.get('CalculateSpellDamageTooltip');
    const stripped = {};
    for (const [lang, text] of Object.entries(withFallback(label))) {
      stripped[lang] = text.replace(/^%\s*/, '');
    }
    rows.push({
      label: stripped,
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

const levelsOrNull = (raw) =>
  raw && splitLevels(raw).some((v) => Number(v) !== 0) ? splitLevels(raw) : null;

/**
 * 一次读齐 KV 与本地化，返回按技能名取数的函数。langs 决定产出哪几种语言，zh、en 必须在内。
 * 取不到值的描述占位符记进 unresolved，由调用方的自检决定是否放行。
 */
export function createAbilityReader(game, version, langs) {
  const bodiesByAbility = new Map();
  for (const file of kvSourceFiles(game, version)) {
    for (const [name, body] of blockBodies(readText(file))) {
      if (!bodiesByAbility.has(name)) bodiesByAbility.set(name, []);
      bodiesByAbility.get(name).push(body);
    }
  }

  const locales = {};
  // 引擎查本地化不分大小写，game 与原版文件里 ability / Ability 两种写法都有
  const lowered = {};
  for (const lang of langs) {
    const files = localeSourceFiles(game, version, lang);
    const src = { addon: parseFlatKv(files.addon), reference: parseFlatKv(files.reference) };
    locales[lang] = src;
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

  function read(abilityName) {
    const bodies = bodiesByAbility.get(abilityName) ?? [];
    const kv = abilityKv(bodies);
    // 描述里的占位符不分大小写，也能引用顶层字段：%abilityduration% 指的是 AbilityDuration
    const values = new Map(
      [...kv.top, ...[...kv.values].map(([name, { value }]) => [name, value])].map(([name, value]) => [
        name.toLowerCase(),
        value,
      ]),
    );
    const textureMatch = bodies
      .map((b) => b.match(/"AbilityTextureName"\s*"([^"]+)"/))
      .find(Boolean);
    // 没写 AbilityTextureName 的原版技能，引擎按技能名找同名图标
    const texture = textureMatch ? textureMatch[1] : abilityName;

    const key = `DOTA_Tooltip_ability_${abilityName}`;
    const titles = labelOf(key);
    const descs = labelOf(`${key}_Description`);
    const text = {};
    for (const lang of langs) {
      // 一次从左到右扫完：%% 是百分号的转义，先替换占位符再还原转义会把「%value%%%」拆错
      const desc = descs[lang].replace(/%([A-Za-z0-9_]*)%/g, (whole, name) => {
        if (name === '') return '%';
        const lower = name.toLowerCase();
        const value = values.get(lower) ?? values.get(lower.replace(/_tooltip$/, ''));
        if (value === undefined) {
          unresolved.push(`${abilityName} 的 %${name}%`);
          return whole;
        }
        return value;
      });
      // 标题、描述都走 GameText 渲染，只认 <br>，本地化里的换行在这里统一转换
      text[lang] = {
        title: titles[lang].replace(/\n/g, '<br>'),
        desc: desc.replace(/\n/g, '<br>'),
      };
    }
    for (const lang of langs) {
      if (!text[lang].title) text[lang].title = text.en.title;
      if (!text[lang].desc) text[lang].desc = text.en.desc;
    }

    const damageType = DAMAGE_TYPES[kv.top.get('AbilityUnitDamageType')] ?? null;
    const lore = labelOf(`${key}_Lore`);
    const ability = {
      behavior: behaviorOf(kv.top.get('AbilityBehavior')),
      targeting: targetingOf(kv.top.get('AbilityUnitTargetTeam'), kv.top.get('AbilityUnitTargetType')),
      damageType,
      piercesImmunity: immunityOf(kv.top.get('SpellImmunityType')),
      dispellable: DISPELLABLE[kv.top.get('SpellDispellableType')] ?? null,
      values: valueRows(abilityName, kv, labelOf, damageType),
      cooldown: levelsOrNull(kv.values.get('AbilityCooldown')?.value ?? kv.top.get('AbilityCooldown')),
      manaCost: levelsOrNull(kv.values.get('AbilityManaCost')?.value ?? kv.top.get('AbilityManaCost')),
      lore: lore.zh && lore.en ? withFallback(lore) : null,
    };

    return { found: bodies.length > 0, texture, text, ability };
  }

  return { read, locales, unresolved };
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
