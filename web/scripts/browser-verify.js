const { chromium } = require('playwright-core');

const VIEWPORTS = {
  320: { width: 320, height: 800 },
  375: { width: 375, height: 800 },
  768: { width: 768, height: 900 },
  1280: { width: 1280, height: 900 },
  1920: { width: 1920, height: 1000 },
};

// 复用系统 Chrome，跨平台不用摸索可执行文件路径
async function launchChrome() {
  return chromium.launch({ channel: 'chrome', headless: true });
}

async function withPage(browser, viewport, fn) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  await fn(page);
  await context.close();
  return errors;
}

// Next.js 把 RSC 数据内嵌在 <script> 里，textContent('body') 会连带算进去，只取真正渲染出来的可见文本
async function visibleText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function hasHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

module.exports = { VIEWPORTS, launchChrome, withPage, visibleText, hasHorizontalOverflow };
