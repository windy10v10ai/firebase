import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAbilityReader,
  gameHead,
  parseFlatKv,
  readItemRecipes,
  resolveDotaVersion,
  resolveGameRepo,
} from './dota-ability.mjs';

/**
 * 从 game 仓库重新生成百科的数据：web/config/wiki-abilities.json、wiki-items.json 是名单与档位，
 * wiki-ability-details.json、wiki-item-details.json 是提示框要的说明，页面按需加载。
 * 技能与抽奖物品读抽选池，商店物品读商店与配方；说明与觉醒页同一套取数规则，名字与图标查 config/abilities.json、items.json，不重复存。
 *
 * 跑法：cd web && npm run wiki:sync
 */

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');
const LANGS = ['zh', 'en', 'ru'];
// 物品池最高到 T7，游戏里只看得出五种颜色，网站照玩家看到的并成五档
const MAX_TIER = 5;

const ABILITY_POOL = 'src/vscripts/modules/lottery/ability/lottery-abilities.ts';
const ITEM_POOL = 'src/vscripts/modules/lottery/item/lottery-items.ts';
const SHOP_FILE = 'game/scripts/shops.txt';
const CUSTOM_ITEM_KV = new Set([
  'npc_items_custom.txt',
  'npc_items_artifact.txt',
  'npc_items_clone.txt',
]);

// 下面三份名单是定下来的分区，写错名字或 game 删了物品时自检会报出来
const SHOP_EXCLUDED = [
  'item_arcane_blink_2',
  'item_collector',
  'item_skill_reset',
  'item_rune_transmuter_random',
  'item_rune_transmuter_advanced',
  'item_exchange',
  // 只用来合成神龙赐福，玩家不单独查它
  'item_wish_1',
  'item_wish_2',
  'item_wish_3',
  'item_wish_4',
];
// game 把一些高级版与原版对调了名字，高级版写在原版覆盖文件里；凭 game 本地化给它起了自己的名字认出来
const OVERRIDE_ITEM_KV = 'npc_items_override.txt';
const ADDON_ZH = 'game/resource/addon_schinese.txt';
// 同一系列在同一价格档里排在一起，系列内按升级顺序；跨档的仍各待各的档
const SHOP_SERIES = [
  ['item_overwhelming_blink_2', 'item_swift_blink_2', 'item_arcane_blink'],
  ['item_jump_jump_jump', 'item_fall_fall_fall'],
  [
    'item_armlet_plus',
    'item_armlet_pro_max',
    'item_armlet_light',
    'item_armlet_dark',
    'item_armlet_artifact',
  ],
  ['item_kaya_and_sange_1', 'item_sange_and_yasha_1', 'item_yasha_and_kaya_1'],
  ['item_wasp_callous', 'item_wasp_despotic', 'item_wasp_golden'],
  ['item_shotgun', 'item_shotgun_v2'],
  ['item_bloodstone_v2', 'item_bloodstone'],
  ['item_adi_king', 'item_adi_king_plus'],
  ['item_force_staff_2', 'item_force_staff_3'],
  ['item_aether_lens_2', 'item_arcane_octarine_core', 'item_refresh_core'],
  ['item_manta_1', 'item_manta_2'],
  ['item_sphere_2', 'item_saint_orb'],
  ['item_veil_of_discord_2', 'item_shivas_guard_2'],
  ['item_blade_mail_2', 'item_force_field_ultra'],
  ['item_dodo_desolator', 'item_infernal_desolator'],
  ['item_magic_scepter', 'item_hallowed_scepter'],
  ['item_quelling_blade_2_datadriven', 'item_bfury_ultra'],
  ['item_monkey_king_bar_2', 'item_excalibur', 'item_rapier_ultra', 'item_rapier_ultra_bot'],
  ['item_hurricane_pike_2', 'item_hydras_breath_2'],
  ['item_hawkeye_fighter', 'item_hawkeye_turret'],
  ['item_beast_armor', 'item_beast_shield'],
  ['item_necronomicon_staff', 'item_shadow_impact', 'item_shadow_judgment'],
  ['item_forbidden_staff', 'item_forbidden_blade'],
];
const SHOP_CONSUMABLES = [
  'item_candy_candy',
  'item_tome_of_strength',
  'item_tome_of_agility',
  'item_tome_of_intelligence',
  'item_tome_of_luoshu',
  'item_tome_of_ability_reset',
  'item_awaken_stone',
];
// 不按价格上色的消耗道具：觉醒石不花钱，在游戏里却是最稀有的一档
const CONSUMABLE_TIERS = { item_awaken_stone: 5 };
// 打怪掉落，商店里买不到，要单独列出来才收得进商店分类；没有价格，边框颜色按游戏里的稀有程度定，顺序即页面上的顺序
const SHOP_DROP_TIERS = {
  item_light_part: 4,
  item_dark_part: 4,
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`item_dragon_ball_${n}`, 4])),
  ...Object.fromEntries(
    ['hawkeye', 'forbidden', 'brutal', 'beast', 'life', 'shadow', 'magic', 'agile'].map((n) => [
      `item_fusion_${n}`,
      5,
    ]),
  ),
  item_blessing_of_dragon: 5,
  item_blessing_of_dragon_1: 5,
  item_blessing_of_dragon_2: 5,
  item_blessing_of_dragon_3: 5,
  item_blessing_of_dragon_4: 5,
};
const SHOP_DROPS = Object.keys(SHOP_DROP_TIERS);
// 与 bot 出装分档同一组边界，最后一档含 30000
const PRICE_TIER_CEILINGS = [2000, 5000, 10000];
const PRICE_TOP = 30000;
const MIN_ABILITIES = 150;
const MIN_LOTTERY_ITEMS = 40;
const MIN_SHOP_ITEMS = 100;

const priceTier = (price) => {
  if (price >= PRICE_TOP) return 5;
  const index = PRICE_TIER_CEILINGS.findIndex((ceiling) => price <= ceiling);
  return index === -1 ? 4 : index + 1;
};

/** 按行扫抽选池：注释掉的条目不在池里，同一条出现在多个档位时按先出现的高档位算 */
function readPool(file, groups) {
  const entries = [];
  const duplicates = [];
  const seen = new Set();
  let group = null;
  let tier = null;
  // CRLF 检出时行尾的 \r 会让行注释的正则匹配不上，注释掉的条目会被当成在池里
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
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
  for (const name of duplicates)
    console.warn(`告警：${name} 在抽选池里出现了不止一次，按最高档位算`);
  return entries;
}

/**
 * 商店分类收哪些物品：商店里的自定义物品，加上材料拿得到、靠配方合成的自定义物品（配方都能直接买），再加掉落名单，去掉排除名单。
 * 价格按配方价加材料价逐层加总，与游戏里看到的一致。
 */
function readShop(game, version, lotteryNames, errors) {
  const kv = readItemRecipes(game, version);
  const shopText = fs.readFileSync(path.join(game, SHOP_FILE), 'utf8').replace(/\/\/[^\n]*/g, '');
  const inShop = [
    ...new Set([...shopText.matchAll(/"item"\s+"(item_[a-z0-9_]+)"/g)].map((m) => m[1])),
  ];
  const renamed = new Set(
    [...parseFlatKv(path.join(game, ADDON_ZH)).keys()].map((key) => key.toLowerCase()),
  );
  const isCustom = (name) =>
    CUSTOM_ITEM_KV.has(kv.get(name)?.source) ||
    (kv.get(name)?.source === OVERRIDE_ITEM_KV && renamed.has(`dota_tooltip_ability_${name}`));
  const recipes = [...kv.entries()].filter(([, v]) => v.recipe && v.result);

  const obtainable = new Set([...inShop, ...lotteryNames, ...SHOP_DROPS]);
  // 材料写成 item_xxx* 时表示同一系列任意一级都行
  const have = (part) =>
    part.endsWith('*')
      ? [...obtainable].some((name) => name.startsWith(part.slice(0, -1)))
      : obtainable.has(part);
  // 抽奖池里也有的合成物品同样要收，所以按「合得出来」判断，不按「别处拿不到」
  const crafted = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const [, recipe] of recipes) {
      if (crafted.includes(recipe.result)) continue;
      if (recipe.requirements.some((route) => route.every(have))) {
        obtainable.add(recipe.result);
        crafted.push(recipe.result);
        changed = true;
      }
    }
  }

  const recipeOf = new Map(recipes.map(([, v]) => [v.result, v]).reverse());
  const prices = new Map();
  const priceOf = (name, depth = 0) => {
    if (prices.has(name)) return prices.get(name);
    const recipe = recipeOf.get(name);
    let price = kv.get(name)?.cost ?? 0;
    if (recipe && depth < 20) {
      const route = recipe.requirements[0] ?? [];
      price =
        (recipe.cost ?? 0) +
        route.reduce((sum, part) => sum + priceOf(part.replace(/\*$/, ''), depth + 1), 0);
    }
    prices.set(name, price);
    return price;
  };

  for (const name of [...SHOP_EXCLUDED, ...SHOP_CONSUMABLES, ...SHOP_DROPS]) {
    if (!kv.has(name)) errors.push(`商店名单里的 ${name} 在 KV 里找不到`);
  }
  const excluded = new Set(SHOP_EXCLUDED);
  const drops = new Set(SHOP_DROPS);
  const consumables = new Set(SHOP_CONSUMABLES);
  const names = [
    ...new Set([...inShop, ...crafted].filter((name) => isCustom(name) && !kv.get(name)?.recipe)),
  ].filter((name) => !excluded.has(name) && !drops.has(name));
  for (const name of SHOP_CONSUMABLES) {
    if (!names.includes(name)) errors.push(`消耗道具 ${name} 不在商店里`);
  }

  const equipment = names
    .filter((name) => !consumables.has(name))
    .map((name) => ({ name, section: 'equipment', price: priceOf(name) }))
    .sort((a, b) => a.price - b.price);
  for (const entry of equipment) {
    if (entry.price <= 0) errors.push(`${entry.name} 算不出价格`);
  }
  return [
    ...groupSeries(
      equipment.map((entry) => ({ ...entry, tier: priceTier(entry.price) })),
      errors,
    ),
    ...SHOP_CONSUMABLES.map((name) => {
      const price = priceOf(name);
      return {
        name,
        section: 'consumable',
        price,
        tier: CONSUMABLE_TIERS[name] ?? priceTier(price),
      };
    }),
    ...SHOP_DROPS.map((name) => ({
      name,
      section: 'drop',
      price: null,
      tier: SHOP_DROP_TIERS[name],
    })),
  ];
}

/** 已按价格排好的装备里，同一档的系列成员挪到该系列在这一档最便宜那件的位置 */
function groupSeries(equipment, errors) {
  const names = new Set(equipment.map((entry) => entry.name));
  const seriesOf = new Map();
  for (const series of SHOP_SERIES) {
    for (const name of series) {
      if (!names.has(name)) errors.push(`系列名单里的 ${name} 不在商店装备里`);
      seriesOf.set(name, series);
    }
  }
  const placed = new Set();
  const out = [];
  for (const entry of equipment) {
    if (placed.has(entry.name)) continue;
    const series = seriesOf.get(entry.name);
    const members = series
      ? series
          .map((name) => equipment.find((e) => e.name === name))
          .filter((e) => e && e.tier === entry.tier)
      : [entry];
    for (const member of members) {
      placed.add(member.name);
      out.push(member);
    }
  }
  return out;
}

/** 读每条的说明并自检；needsDesc 为 false 时纯加属性、只有数值的物品也放行 */
function readDetails(reader, names, kind, needsDesc, errors) {
  const assets = JSON.parse(fs.readFileSync(path.join(WEB, `config/${kind}.json`), 'utf8'));
  const details = {};
  for (const name of names) {
    const { found, text, ability } = reader.read(name);
    const desc = {};
    for (const lang of LANGS) desc[lang] = text[lang].desc;
    if (!found) errors.push(`${name} 在 KV 里找不到`);
    if (!assets[name]) errors.push(`${name} 不在 config/${kind}.json，先跑 npm run items`);
    if (needsDesc) {
      for (const lang of ['zh', 'en']) {
        if (!desc[lang]) errors.push(`${name} 缺 ${lang} 描述`);
      }
    } else if (!desc.en && ability.values.length === 0) {
      errors.push(`${name} 既没有描述也没有数值，提示框会是空的`);
    }
    for (const lang of LANGS) {
      if (desc[lang].includes('\\')) errors.push(`${name} 的 ${lang} 描述残留反斜杠转义`);
      // 网站的说明渲染只认这几种标记，其余会原样显示成源码
      for (const [tag] of desc[lang].matchAll(/<\/?[a-z0-9]+\b[^>]*>/gi)) {
        if (!/^<\/?(br|b|h1|font)\b/i.test(tag)) {
          errors.push(`${name} 的 ${lang} 描述有网站不认的标记 ${tag}`);
        }
      }
      if (ability.lore?.[lang].includes('\\')) {
        errors.push(`${name} 的 ${lang} 背景故事残留反斜杠转义`);
      }
    }
    details[name] = { desc, ability };
  }
  if (reader.unresolved.length) {
    errors.push(`有占位符取不到值：${[...new Set(reader.unresolved)].join('、')}`);
  }
  return details;
}

function checkPool(entries, kind, min, errors) {
  if (entries.length < min) {
    errors.push(`${kind} 只解析出 ${entries.length} 条，少于下限 ${min}，多半是解析失效了`);
  }
  for (const entry of entries) {
    if (entry.tier === null) errors.push(`${entry.name} 读不出档位`);
  }
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

  const errors = [];
  const abilities = readPool(path.join(game, ABILITY_POOL), {
    abilityTiersActive: 'active',
    abilityTiersPassive: 'passive',
  });
  checkPool(abilities, 'abilities', MIN_ABILITIES, errors);
  const lottery = readPool(path.join(game, ITEM_POOL), { itemTiers: 'all' }).map(
    ({ name, tier }) => ({ name, tier }),
  );
  checkPool(lottery, 'lottery items', MIN_LOTTERY_ITEMS, errors);
  const shop = readShop(
    game,
    version,
    lottery.map((entry) => entry.name),
    errors,
  );
  if (shop.length < MIN_SHOP_ITEMS) {
    errors.push(`商店物品只算出 ${shop.length} 条，少于下限 ${MIN_SHOP_ITEMS}，多半是解析失效了`);
  }

  const abilityDetails = readDetails(
    createAbilityReader(game, version, LANGS, 'abilities'),
    abilities.map((entry) => entry.name),
    'abilities',
    true,
    errors,
  );
  const itemDetails = readDetails(
    createAbilityReader(game, version, LANGS, 'items'),
    [...new Set([...lottery, ...shop].map((entry) => entry.name))],
    'items',
    false,
    errors,
  );

  if (errors.length) {
    console.error('自检未通过，没有生成任何文件：');
    for (const error of [...new Set(errors)]) console.error(`  - ${error}`);
    process.exit(1);
  }

  const source = { gameCommit: head.commit, dotaVersion: version };
  const outputs = {
    'wiki-abilities.json': { source, abilities },
    'wiki-items.json': { source, priceTiers: [...PRICE_TIER_CEILINGS, PRICE_TOP], lottery, shop },
    'wiki-ability-details.json': abilityDetails,
    'wiki-item-details.json': itemDetails,
  };
  for (const [file, data] of Object.entries(outputs)) {
    const out = path.join(WEB, 'config', file);
    const next = `${JSON.stringify(data, null, 2)}\n`;
    const changed = !fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== next;
    fs.writeFileSync(out, next);
    console.log(`${file} ${changed ? '有变化' : '无变化'}`);
  }
  console.log(
    `技能 ${abilities.length} 条，抽奖物品 ${lottery.length} 条，商店物品 ${shop.length} 条，` +
      `Dota ${version}，game develop@${head.commit.slice(0, 9)}`,
  );
}

main();
