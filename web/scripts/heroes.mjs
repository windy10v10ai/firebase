import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveDotaVersion, resolveGameRepo } from './awaken-source.mjs';

/**
 * 取英雄小地图头像与中英文名，产出清单 config/heroes.json。
 *
 * 跑法：cd web && npm run heroes
 */

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');
const TASKS_CONFIG = path.join(REPO, 'api/src/daily-task/config/tasks.ts');
const OUT_DIR = path.join(WEB, 'public/heroes');
const MANIFEST = path.join(WEB, 'config/heroes.json');
// game 仓库把这些内部英雄名换了皮（改了模型/名字），Dota 官方数据里查到的还是原版，
// 换皮的名字/头像收在这张表和同目录 hero-overrides/ 下，逐条覆盖官方数据
const OVERRIDES_FILE = path.join(WEB, 'config/hero-overrides.json');
const OVERRIDE_ICON_DIR = path.join(WEB, 'config/hero-overrides');

const ICON_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons';

const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

/** 英雄清单取自任务池本身，池子加英雄时这里跟着变，不另存一份名单 */
function readHeroNames() {
  const text = fs.readFileSync(TASKS_CONFIG, 'utf8');
  const names = [...text.matchAll(/heroName:\s*'(npc_dota_hero_[a-z_0-9]+)'/g)].map((m) => m[1]);
  if (names.length === 0) {
    throw new Error(`${TASKS_CONFIG} 里没找到 heroName`);
  }
  return [...new Set(names)].sort();
}

/** `"npc_dota_hero_lina:n" "莉娜"`：Dota 自带的英雄名，addon 里没有 */
function readHeroLabels(file) {
  const text = fs.readFileSync(file, 'utf8');
  const labels = new Map();
  for (const m of text.matchAll(/"(npc_dota_hero_[a-z_0-9]+):n"\s+"([^"]*)"/g)) {
    labels.set(m[1], m[2]);
  }
  return labels;
}

async function fetchIcon(short) {
  const res = await fetch(`${ICON_CDN}/${short}.png`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const game = resolveGameRepo(REPO);
  const version = resolveDotaVersion(game);
  const zh = readHeroLabels(path.join(game, `docs/reference/${version}/abilities_schinese.txt`));
  const en = readHeroLabels(path.join(game, `docs/reference/${version}/abilities_english.txt`));

  const heroes = readHeroNames();
  const previous = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest = {};
  const missing = [];
  let fetched = 0;
  let skinned = 0;

  for (const heroName of heroes) {
    const short = heroName.replace('npc_dota_hero_', '');
    const override = overrides[heroName];
    const kept = previous[heroName];
    let icon = kept?.icon;

    if (override?.icon) {
      const buf = fs.readFileSync(path.join(OVERRIDE_ICON_DIR, `${short}.png`));
      const wantIcon = `${short}.${hash8(buf)}.png`;
      if (icon !== wantIcon || !fs.existsSync(path.join(OUT_DIR, icon))) {
        fs.writeFileSync(path.join(OUT_DIR, wantIcon), buf);
        icon = wantIcon;
        skinned++;
      }
    } else if (!icon || !fs.existsSync(path.join(OUT_DIR, icon))) {
      const buf = await fetchIcon(short);
      if (buf) {
        icon = `${short}.${hash8(buf)}.png`;
        fs.writeFileSync(path.join(OUT_DIR, icon), buf);
        fetched++;
      } else {
        icon = null;
        missing.push(`头像 ${short}`);
      }
    }

    const zhName = override?.zh ?? zh.get(heroName);
    const enName = override?.en ?? en.get(heroName);
    if (!zhName || !enName) {
      missing.push(`名字 ${short}`);
    }

    manifest[heroName] = { icon, zh: zhName ?? short, en: enName ?? short };
  }

  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  // 清单里没有的文件是换图换下来的旧版本，删掉，免得越积越多
  const keep = new Set(Object.values(manifest).map((hero) => hero.icon));
  let pruned = 0;
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (!keep.has(file)) {
      fs.unlinkSync(path.join(OUT_DIR, file));
      pruned++;
    }
  }

  const total = [...keep]
    .filter(Boolean)
    .reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  console.log(
    `英雄 ${heroes.length} 个：新下载 ${fetched}，换皮 ${skinned}，沿用 ${heroes.length - fetched - skinned}，` +
      `清掉旧文件 ${pruned}，共 ${(total / 1024).toFixed(0)}KB（Dota ${version}）`,
  );
  if (missing.length) {
    console.log(`缺：${missing.join('、')}`);
  }
}

await main();
