import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 从 Noto Sans SC 截出顶栏与页面大标题用到的字形，产出 app/fonts/heading.woff2 与字符清单。
 *
 * 跑法：cd web && npm run font:heading
 * 校验：npm run font:heading:check，文案里出现字体没收录的字时报错，不需要下载源字体
 */

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESSAGES_DIR = path.join(WEB, 'messages');
const LOCALES_FILE = path.join(WEB, 'i18n/locales.ts');
const OUT_DIR = path.join(WEB, 'app/fonts');
const FONT_OUT = path.join(OUT_DIR, 'heading.woff2');
const CHARS_OUT = path.join(OUT_DIR, 'heading-chars.txt');

// 钉在 google/fonts 的某个提交上，同样的字符清单总是截出同一份字体
const SOURCE_COMMIT = 'a85815a42757630ce188fdad368c2dfc444d4773';
const SOURCE_URL = `https://raw.githubusercontent.com/google/fonts/${SOURCE_COMMIT}/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf`;
const SOURCE_CACHE = path.join(WEB, 'node_modules/.cache/heading-font', `NotoSansSC-${SOURCE_COMMIT}.ttf`);

// 顶栏文字是常规粗细，logo 与标题是粗体，两端之间的字重都保留在可变字体里
const WEIGHT_RANGE = { min: 400, max: 700 };

// 西文与俄文字母整套收录，标题以后改措辞不必重截；汉字只收文案里出现过的，整套收录体积会大上百倍
const ALWAYS_INCLUDED = [
  ...Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)),
  ...Array.from({ length: 0x450 - 0x410 }, (_, i) => String.fromCharCode(0x410 + i)),
  'Ё',
  'ё',
];

/** 顶栏导航、登录退出按钮，以及各页标题（键名为 title 或以 Title 结尾） */
function isHeadingKey(key) {
  return (
    key.startsWith('navigation.') ||
    ['auth.login', 'auth.loginShort', 'auth.signOut'].includes(key) ||
    /(^|\.)(title|[A-Za-z]*Title)$/.test(key)
  );
}

function* flatten(obj, prefix = '') {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') {
      yield* flatten(value, full);
    } else if (typeof value === 'string') {
      yield [full, value];
    }
  }
}

function collectChars() {
  const texts = [];
  for (const file of fs.readdirSync(MESSAGES_DIR).filter((name) => name.endsWith('.json'))) {
    const messages = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, file), 'utf8'));
    for (const [key, value] of flatten(messages)) {
      if (isHeadingKey(key)) {
        // 占位符运行时才替换成数据，花括号与变量名不会出现在页面上
        texts.push(value.replace(/\{[^}]*\}/g, ''));
      }
    }
  }
  // 语言切换按钮上的单字标记和语言名写在代码里，不在文案文件
  const localeSource = fs.readFileSync(LOCALES_FILE, 'utf8');
  for (const match of localeSource.matchAll(/(?:mark|name): '([^']+)'/g)) {
    texts.push(match[1]);
  }

  const chars = new Set(ALWAYS_INCLUDED);
  for (const ch of texts.join('')) {
    if (!/\s/.test(ch)) {
      chars.add(ch);
    }
  }
  return [...chars].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
}

async function loadSource() {
  if (!fs.existsSync(SOURCE_CACHE)) {
    console.log(`下载源字体 ${SOURCE_URL}`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) {
      throw new Error(`下载源字体失败：HTTP ${res.status}`);
    }
    fs.mkdirSync(path.dirname(SOURCE_CACHE), { recursive: true });
    fs.writeFileSync(SOURCE_CACHE, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(SOURCE_CACHE);
}

async function generate() {
  const { default: subsetFont } = await import('subset-font');
  const chars = collectChars();
  const font = await subsetFont(await loadSource(), chars, {
    targetFormat: 'woff2',
    // 版式替换会把竖排、全角等变体字形连带收进来，体积多出一半，标题用不到
    noLayoutClosure: true,
    variationAxes: { wght: WEIGHT_RANGE },
  });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(FONT_OUT, font);
  fs.writeFileSync(CHARS_OUT, `${chars}\n`);
  console.log(`${[...chars].length} 个字符，${(font.length / 1024).toFixed(1)} KB → ${path.relative(WEB, FONT_OUT)}`);
}

function check() {
  const included = new Set(fs.readFileSync(CHARS_OUT, 'utf8').replace(/\n$/, ''));
  const missing = [...collectChars()].filter((ch) => !included.has(ch));
  if (missing.length > 0) {
    console.error(`标题字体缺少这些字：${missing.join('')}\n跑 cd web && npm run font:heading 重新截取并提交产物`);
    process.exit(1);
  }
  console.log('标题字体覆盖了全部标题与导航文字');
}

if (process.argv.includes('--check')) {
  check();
} else {
  await generate();
}
