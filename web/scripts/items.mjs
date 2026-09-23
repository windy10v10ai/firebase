import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveGameRepo } from './awaken-source.mjs';

/**
 * 取物品与抽选技能的图标和三语名字，产出清单 config/items.json、config/abilities.json。
 * 按内部名索引、每类一个目录，与英雄头像同一套结构：战绩出装与日后的物品图鉴查的是同一份。
 *
 * 跑法：cd web && npm run items [-- 物品统计导出.csv]
 * 带上 GA 导出的物品表（第一列是物品名）时，表里玩家真买过、配置推不出来的物品也一起收进清单。
 */

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');

const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react';
const DATAFEED = 'https://www.dota2.com/datafeed';
const LANGUAGES = { zh: 'schinese', en: 'english', ru: 'russian' };

const ITEM_KV_FILES = [
  'npc_items_custom.txt',
  'npc_items_artifact.txt',
  'npc_items_clone.txt',
  'npc_items_override.txt',
  'npc_items_override_neutral.txt',
  'npc_items_override_neutral_passive.txt',
];
const ABILITY_KV_FILES = [
  'npc_abilities_custom.txt',
  'npc_abilities_custom_lottery.txt',
  'npc_abilities_custom_awaken.txt',
  'npc_abilities_override.txt',
  'npc_abilities_creep.txt',
];

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    throw new Error(
      '取图需要 sharp，但它不在依赖里（只有取图脚本用得到，不值得让每次部署都装一遍）。\n' +
        '先跑一次 `npm i sharp --no-save`，再跑本脚本。',
    );
  }
}

const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
const isRecipe = (name) => name.startsWith('item_recipe_');

/** KeyValues 顶层之下一层的块，取出其中的扁平键值；注释按词法跳过，引号里的 // 不受影响 */
function readKvBlocks(file) {
  const text = fs.readFileSync(file, 'utf8');
  const tokens = [...text.matchAll(/"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*/g)]
    .filter((m) => m[1] !== undefined || m[2] !== undefined)
    .map((m) => (m[2] !== undefined ? { brace: m[2] } : { text: m[1] }));

  const blocks = new Map();
  let depth = 0;
  let pending = null;
  let current = null;
  for (const token of tokens) {
    if (token.brace === '{') {
      depth++;
      if (depth === 2) current = { name: pending, props: {} };
      pending = null;
    } else if (token.brace === '}') {
      if (depth === 2 && current) blocks.set(current.name, current.props);
      depth--;
      pending = null;
    } else if (pending === null) {
      pending = token.text;
    } else {
      if (depth === 2 && current) current.props[pending] = token.text;
      pending = null;
    }
  }
  return blocks;
}

function readKvDir(dir, files) {
  const merged = new Map();
  for (const file of files) {
    for (const [name, props] of readKvBlocks(path.join(dir, file))) {
      merged.set(name, { ...merged.get(name), ...props });
    }
  }
  return merged;
}

/** 注释掉的行不算，所以先去掉行注释再找 */
function readListed(file, pattern) {
  const text = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  return [...text.matchAll(pattern)].map((m) => m[1]);
}

/** 逐字去掉尖括号及其间的内容：正则整段替换遇到嵌套或没配对的标签会留下半截 */
function stripTags(raw) {
  let out = '';
  let inTag = false;
  for (const ch of raw) {
    if (ch === '<') inTag = true;
    else if (ch === '>') inTag = false;
    else if (!inTag) out += ch;
  }
  return out.trim();
}

/** game 的本地化只收自定义与改名的条目，名字带颜色标签，去掉 */
function readAddonNames(file) {
  const names = new Map();
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/"DOTA_Tooltip_ability_([a-z0-9_]+)"\s+"((?:[^"\\]|\\.)*)"/gi)) {
    const label = stripTags(m[2]);
    if (label) names.set(m[1].toLowerCase(), label);
  }
  return names;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

/** Dota 官方数据源的物品、技能名，三种语言各一份 */
async function readDotaNames(kind) {
  const byLocale = {};
  for (const [locale, language] of Object.entries(LANGUAGES)) {
    const json = await fetchJson(`${DATAFEED}/${kind}list?language=${language}`);
    byLocale[locale] = new Map(
      json.result.data.itemabilities.filter((e) => e.name_loc).map((e) => [e.name, e.name_loc]),
    );
  }
  return byLocale;
}

async function fetchPng(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  // CDN 查不到时有时回 200 加一张占位页，只认 PNG 签名
  return buf.subarray(0, 4).toString('hex') === '89504e47' ? buf : null;
}

/**
 * 图标按顺序找：game 自带的图（自定义、换皮的都在这），再到 Dota CDN 依次试贴图名、基类、本名。
 * 贴图名常是饰品路径，CDN 上只有对应的原版技能图，所以取路径最后一段、去掉饰品后缀再试。
 */
async function resolveIcon(name, texture, baseClass, gameDir, cdnDir) {
  const local = path.join(gameDir, `${texture}.png`);
  if (fs.existsSync(local)) return { buf: fs.readFileSync(local), from: 'game' };
  const leaf = texture.split('/').pop();
  const candidates = [
    leaf,
    leaf.replace(/_(immortal|arcana|persona\d*|alt\d*)$/, ''),
    baseClass,
    name,
  ];
  for (const candidate of new Set(candidates)) {
    if (!candidate) continue;
    const buf = await fetchPng(`${CDN}/${cdnDir}/${candidate}.png`);
    if (buf) return { buf, from: 'cdn' };
  }
  return null;
}

async function buildManifest({
  kind,
  names,
  kv,
  gameIconDir,
  cdnDir,
  stripPrefix,
  size,
  sharp,
  addon,
  dota,
}) {
  const outDir = path.join(WEB, `public/${kind}`);
  const manifestFile = path.join(WEB, `config/${kind}.json`);
  const previous = fs.existsSync(manifestFile)
    ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    : {};
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {};
  const count = { game: 0, cdn: 0, kept: 0 };
  const missing = [];

  for (const name of [...names].sort()) {
    const short = stripPrefix ? name.replace(/^item_/, '') : name;
    const unprefix = (value) => (stripPrefix ? value.replace(/^item_/, '') : value);
    const texture = unprefix(kv.get(name)?.AbilityTextureName ?? name);
    const baseClass = kv.get(name)?.BaseClass;
    const cdnBase = baseClass && !/lua|datadriven/.test(baseClass) ? unprefix(baseClass) : null;
    const kept = previous[name]?.icon;
    let icon = kept && fs.existsSync(path.join(outDir, kept)) ? kept : null;

    if (icon) {
      count.kept++;
    } else {
      const found = await resolveIcon(short, texture, cdnBase, gameIconDir, cdnDir);
      if (found) {
        // 统一成官方图的原尺寸再转 webp：图鉴放大展示也不糊，体积仍只有 PNG 的一成
        const buf = await sharp(found.buf)
          .resize(size.width, size.height, { fit: 'cover' })
          .webp({ quality: 82 })
          .toBuffer();
        icon = `${short}.${hash8(buf)}.webp`;
        fs.writeFileSync(path.join(outDir, icon), buf);
        count[found.from]++;
      } else {
        missing.push(`图标 ${name}`);
      }
    }

    const label = {};
    for (const locale of Object.keys(LANGUAGES)) {
      label[locale] = addon[locale].get(name) ?? dota[locale].get(name) ?? null;
    }
    if (!label.en) missing.push(`名字 ${name}`);
    manifest[name] = { icon, ...label };
  }

  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  // 清单里没有的文件是换图换下来的旧版本或已删的条目，删掉，免得越积越多
  const keep = new Set(Object.values(manifest).map((entry) => entry.icon));
  let pruned = 0;
  for (const file of fs.readdirSync(outDir)) {
    if (!keep.has(file)) {
      fs.unlinkSync(path.join(outDir, file));
      pruned++;
    }
  }
  const total = [...keep]
    .filter(Boolean)
    .reduce((sum, f) => sum + fs.statSync(path.join(outDir, f)).size, 0);

  console.log(
    `${kind} ${names.size} 个：取自 game ${count.game}，取自 CDN ${count.cdn}，沿用 ${count.kept}，` +
      `清掉旧文件 ${pruned}，共 ${(total / 1024).toFixed(0)}KB`,
  );
  if (missing.length) console.log(`缺：${missing.join('、')}`);
}

/**
 * 物品栏的通用图：空槽底图与通用配方图，照游戏结算界面画空格和配方。
 * 不进物品清单，那份按物品索引，图鉴列物品时不该列出这两张。
 */
async function buildSlotAssets(sharp) {
  const outDir = path.join(WEB, 'public/item-slots');
  const manifestFile = path.join(WEB, 'config/item-slots.json');
  const previous = fs.existsSync(manifestFile)
    ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    : {};
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {};
  for (const [key, cdnName] of Object.entries({ empty: 'emptyitembg', recipe: 'recipe' })) {
    const kept = previous[key];
    if (kept && fs.existsSync(path.join(outDir, kept))) {
      manifest[key] = kept;
      continue;
    }
    const raw = await fetchPng(`${CDN}/items/${cdnName}.png`);
    if (!raw) throw new Error(`CDN 上取不到 ${cdnName}.png`);
    const buf = await sharp(raw).resize(88, 64, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
    manifest[key] = `${cdnName}.${hash8(buf)}.webp`;
    fs.writeFileSync(path.join(outDir, manifest[key]), buf);
  }
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  const keep = new Set(Object.values(manifest));
  for (const file of fs.readdirSync(outDir)) {
    if (!keep.has(file)) fs.unlinkSync(path.join(outDir, file));
  }
}

/** 能留在物品栏里的物品：商店在售、中立掉落、合成产物、神器，加上玩家真买过的 */
function collectItems(npc, scripts, kv, dotaNames, csvFile) {
  const names = new Set([
    ...readListed(path.join(scripts, 'shops.txt'), /"item"\s+"(item_[a-z0-9_]+)"/g),
    ...readListed(path.join(npc, 'neutral_items.txt'), /"(item_[a-z0-9_]+)"\s+"1"/g),
    ...[...readKvBlocks(path.join(npc, 'npc_items_artifact.txt')).keys()],
  ]);
  for (const [name, props] of kv) {
    if (isRecipe(name) && props.ItemResult) names.add(props.ItemResult);
  }

  const previous = path.join(WEB, 'config/items.json');
  if (fs.existsSync(previous)) {
    for (const name of Object.keys(JSON.parse(fs.readFileSync(previous, 'utf8')))) names.add(name);
  }
  if (csvFile) {
    for (const line of fs.readFileSync(csvFile, 'utf8').split('\n')) {
      const name = line.split(',')[0].trim();
      if (/^item_[a-z0-9_]+$/.test(name)) names.add(name);
    }
  }

  // game 里删掉、Dota 也没有的物品不会再出现在新场次里
  for (const name of names) {
    if (isRecipe(name) || (!kv.has(name) && !dotaNames.en.has(name))) names.delete(name);
  }
  return names;
}

async function main() {
  const sharp = await loadSharp();
  const game = resolveGameRepo(REPO);
  const scripts = path.join(game, 'game/scripts');
  const npc = path.join(scripts, 'npc');
  const resource = path.join(game, 'game/resource');
  const addon = {};
  for (const [locale, language] of Object.entries(LANGUAGES)) {
    addon[locale] = readAddonNames(path.join(resource, `addon_${language}.txt`));
  }

  await buildSlotAssets(sharp);

  const itemKv = readKvDir(npc, ITEM_KV_FILES);
  const itemNames = await readDotaNames('item');
  await buildManifest({
    kind: 'items',
    names: collectItems(npc, scripts, itemKv, itemNames, process.argv[2]),
    kv: itemKv,
    gameIconDir: path.join(resource, 'flash3/images/items'),
    cdnDir: 'items',
    stripPrefix: true,
    size: { width: 88, height: 64 },
    sharp,
    addon,
    dota: itemNames,
  });

  const abilityPool = path.join(game, 'src/vscripts/modules/lottery/ability/lottery-abilities.ts');
  const abilities = new Set(readListed(abilityPool, /'([a-z0-9_]+)'/g));
  await buildManifest({
    kind: 'abilities',
    names: abilities,
    kv: readKvDir(npc, ABILITY_KV_FILES),
    gameIconDir: path.join(resource, 'flash3/images/spellicons'),
    cdnDir: 'abilities',
    stripPrefix: false,
    size: { width: 128, height: 128 },
    sharp,
    addon,
    dota: await readDotaNames('ability'),
  });
}

await main();
