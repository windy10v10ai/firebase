import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAwakenSource } from './awaken-source.mjs';

/**
 * 取图并转成 WebP 落到 web/public/dota/，产出清单 awaken-assets.json 供取数脚本引用。
 * 与取数分开是有意的：取数纯离线、可在 CI 里当一致性断言跑，取图要联网又要 sharp。
 *
 * 跑法：cd web && npm run awaken:images
 */

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');
const OUT_DIR = path.join(WEB, 'public/dota');
const MANIFEST = path.join(WEB, 'config/awaken-assets.json');
const CACHE = path.join(REPO, 'node_modules/.cache/awaken-renders');

const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react';
const RENDER_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders';

/** 立绘框 145×190 @2x */
const W = 290;
const H = 380;
const TOP = 34; // 头顶留给英雄名的空白带
const FIG_H = 386; // 人物目标高度，略高于框高；超出的腿脚压在按钮区后面
const MAX_CROP = 1.35; // 横向最多裁到 1.35 倍宽，再宽就整体缩小，不腰斩
const TRIM = 20; // 削掉透明留白与光晕，又不吃掉凤凰的火、寒冬飞龙的翼这类实体特效

/**
 * 横向取景中心（0 最左、0.5 居中、1 最右）。
 * 默认居中：试过按 alpha 重心自动找头部，Dota 立绘里道具的体量和英雄本身相当
 * （鹰、剑、旗、坐骑），两种算法都是修好一个带坏一个，不如可预测的居中加点名修正。
 */
const FOCUS = {
  npc_dota_hero_sven: 0.62, // 大剑举在左上角，居中会把斯温本人挤出右边
};

/** 饰品路径的图标 CDN 上没有，退回同名原版图；键是 AbilityTextureName 原值 */
const TEXTURE_FALLBACK = {
  'keeper_of_the_light/kotl_ti7_immortal/keeper_of_the_light_illuminate_alt':
    'keeper_of_the_light_illuminate_alt',
  'lina/lina_ti6_immortal/lina_laguna_blade': 'lina_laguna_blade',
  'witch_doctor/ribbitar_icon/witch_doctor_death_ward': 'witch_doctor_death_ward',
  'necrolyte/apostle_of_decay_icons/necrolyte_heartstopper_aura': 'necrolyte_heartstopper_aura',
};

/** 自制图标，CDN 没有，从 game 仓库取 */
const FROM_GAME_REPO = new Set([
  'ogre_magi_multicast_lua',
  'axe_auto_culling_blade',
  'juggernaut_blade_fury_immortal_crimson',
]);

const BG = (w, h) => Buffer.from(
  `<svg width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#26202e"/><stop offset="55%" stop-color="#171320"/>` +
    `<stop offset="100%" stop-color="#0d0b12"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/></svg>`,
);

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    throw new Error(
      '取图需要 sharp，但它不在依赖里（只有这个脚本用得到，不值得让每次部署都装一遍）。\n' +
        '先跑一次 `npm i sharp --no-save`，再跑本脚本。',
    );
  }
}

const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** 原始渲染图缓存在 node_modules/.cache，重跑时不用再下 1MB 一张 */
async function cachedRender(hero) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${hero}.png`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const buf = await fetchBuffer(`${RENDER_CDN}/${hero}.png`);
  if (!buf) return null;
  fs.writeFileSync(file, buf);
  return buf;
}

async function buildArt(sharp, heroName) {
  const short = heroName.replace('npc_dota_hero_', '');
  const raw = await cachedRender(short);
  if (!raw) return null;

  const trimmed = await sharp(raw).trim({ threshold: TRIM }).toBuffer({ resolveWithObject: true });
  const { width: tw, height: th } = trimmed.info;

  let figH = FIG_H;
  let figW = Math.round(figH * (tw / th));
  if (figW > W * MAX_CROP) {
    const k = (W * MAX_CROP) / figW;
    figW = Math.round(figW * k);
    figH = Math.round(figH * k);
  }

  let fig = await sharp(trimmed.data).resize(figW, figH).toBuffer();
  let offsetX = 0;
  let curW = figW;
  if (figW > W) {
    const focus = FOCUS[heroName] ?? 0.5;
    const left = Math.min(Math.max(Math.round(focus * figW - W / 2), 0), figW - W);
    fig = await sharp(fig).extract({ left, top: 0, width: W, height: figH }).toBuffer();
    curW = W;
  } else {
    offsetX = Math.round((W - figW) / 2);
  }

  const visible = H - TOP;
  if (figH > visible) {
    fig = await sharp(fig).extract({ left: 0, top: 0, width: curW, height: visible }).toBuffer();
  }
  // 够高的贴顶，多出的腿脚压在按钮区后面；不够高的贴底站地上，不留悬空
  const meta = await sharp(fig).metadata();
  const top = Math.max(TOP, H - meta.height);

  return sharp(BG(W, H))
    .composite([{ input: fig, left: offsetX, top }])
    .webp({ quality: 82 })
    .toBuffer();
}

async function buildIcon(sharp, texture, game) {
  let raw = null;
  if (FROM_GAME_REPO.has(texture)) {
    const file = path.join(game, 'game/resource/flash3/images/spellicons', `${texture}.png`);
    if (fs.existsSync(file)) raw = fs.readFileSync(file);
  } else {
    raw = await fetchBuffer(`${CDN}/abilities/${texture}.png`);
    if (!raw && TEXTURE_FALLBACK[texture]) {
      raw = await fetchBuffer(`${CDN}/abilities/${TEXTURE_FALLBACK[texture]}.png`);
    }
  }
  if (!raw) return null;
  return sharp(raw).resize(96, 96).webp({ quality: 85 }).toBuffer();
}

async function main() {
  const sharp = await loadSharp();
  const { game, heroes } = loadAwakenSource(REPO);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });

  const previous = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    : { art: {}, icons: {} };
  const manifest = { art: {}, icons: {} };
  const missing = [];
  let built = 0;

  for (const hero of heroes) {
    const short = hero.heroName.replace('npc_dota_hero_', '');
    const kept = previous.art[hero.heroName];
    if (kept && fs.existsSync(path.join(OUT_DIR, kept))) {
      manifest.art[hero.heroName] = kept;
    } else {
      const buf = await buildArt(sharp, hero.heroName);
      if (!buf) {
        missing.push(`立绘 ${short}`);
      } else {
        const name = `${short}.${hash8(buf)}.webp`;
        fs.writeFileSync(path.join(OUT_DIR, name), buf);
        manifest.art[hero.heroName] = name;
        built++;
      }
    }

    const keptIcon = previous.icons[hero.texture];
    if (keptIcon && fs.existsSync(path.join(OUT_DIR, keptIcon))) {
      manifest.icons[hero.texture] = keptIcon;
    } else {
      const buf = await buildIcon(sharp, hero.texture, game);
      if (!buf) {
        missing.push(`图标 ${short}（${hero.texture}）`);
      } else {
        const base = hero.texture.split('/').pop();
        const name = `${base}.${hash8(buf)}.webp`;
        fs.writeFileSync(path.join(OUT_DIR, name), buf);
        manifest.icons[hero.texture] = name;
        built++;
      }
    }
  }

  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  // 清单里没有的文件是换图换下来的旧版本，删掉，免得越积越多
  const keep = new Set([...Object.values(manifest.art), ...Object.values(manifest.icons)]);
  let pruned = 0;
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (!keep.has(file)) {
      fs.unlinkSync(path.join(OUT_DIR, file));
      pruned++;
    }
  }

  const total = [...keep].reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  console.log(
    `图片：新生成 ${built}，沿用 ${keep.size - built}，清掉旧文件 ${pruned}，` +
      `共 ${keep.size} 个 / ${(total / 1024).toFixed(0)}KB`,
  );
  if (missing.length) {
    console.log(`取不到（留空占位）：${missing.join('、')}`);
  }
}

await main();
