---
name: web-browser-verify
description: web/ 改动涉及页面行为时，用 Playwright 驱动无头 Chrome 做真实点击/截图/console 检查
---

# 用 Playwright 验证 web/ 的页面行为

适用场景见 [web/CLAUDE.md](../../../web/CLAUDE.md) 的「浏览器验证」——只要改动会影响网站页面行为，就要走这里，curl、控制台 `fetch`、unit、e2e 都不能替代。

## 步骤

1. 生产构建起服务：`cd web && npm run build && npm start`（不要用 dev server，左下角开发指示器会入镜）。**要登录态的页面是例外**，见下面「验证要登录的页面」
2. 在 `web/.browser-verify/`（已被 `.gitignore` 排除，跑完不用清理）下写一次性驱动脚本，`require('../scripts/browser-verify')` 引入公共部分
3. 按 [web/CLAUDE.md](../../../web/CLAUDE.md) 的「验证宽度」逐档过，档位以那一节为准
4. 真实交互用 `page.click()` / `page.fill()`，不要 `eval el.value = ...`——React 受控输入的 `onChange` 不会被后者触发
5. 每档用 `page.screenshot()` 存到 `web/.browser-verify/screenshots/`，后续贴 PR 时按 [web/CLAUDE.md](../../../web/CLAUDE.md) 的「PR 截图」一节操作
6. 每档检查 `withPage` 返回的 console 错误数组，非空就是回归。**`MISSING_MESSAGE` 要当回归看**——i18n key 缺失不会让页面崩，只会渲染成空白或 key 本身，肉眼扫截图看不出来，只有 console 里有
7. 量到横向溢出时，把越界的元素也一并列出来（遍历 `getBoundingClientRect().right > innerWidth`），光有 `scrollWidth` 定位不到是谁撑的。**`opacity-0`、`visibility:hidden` 的元素照样占布局**，藏起来的浮层一样会把页面撑宽
8. **改动碰到界面文案时，中英文各过一遍**，不要只看默认语言。语言取自 `NEXT_LOCALE` cookie，没有就按 `Accept-Language` 判，见 [web/i18n/request.ts](../../../web/i18n/request.ts)：

   ```js
   const context = await browser.newContext({ viewport, locale: 'zh-CN' }); // 或 'en-US'
   ```

   无头 Chrome CLI 截图用 `--accept-lang=zh-CN`。一种语言有文案、另一种缺 key 的情况很常见，只跑一种等于没测

## 示例

```js
// web/.browser-verify/verify.js
const path = require('path');
const { VIEWPORTS, launchChrome, withPage, visibleText, hasHorizontalOverflow } = require('../scripts/browser-verify');

const BASE_URL = 'http://localhost:3000';

(async () => {
  const browser = await launchChrome();

  for (const name of Object.keys(VIEWPORTS)) { // 档位见 web/CLAUDE.md 的「验证宽度」
    const errors = await withPage(browser, VIEWPORTS[name], async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(__dirname, 'screenshots', `home-${name}.png`) });

      await page.getByRole('link', { name: /目标文案/ }).click();
      await page.waitForLoadState('networkidle');

      const overflow = await hasHorizontalOverflow(page);
      console.log(`[${name}] 横向溢出: ${overflow}`);

      const text = await visibleText(page);
      console.log(`[${name}] 包含预期文案: ${text.includes('预期文案')}`);
    });

    if (errors.length > 0) {
      console.error(`[${name}] console 错误:`, errors);
    }
  }

  await browser.close();
})();
```

## 验证要登录的页面

**这类页面只能用 dev server。** [web/config/firebase.ts](../../../web/config/firebase.ts) 只在 `NODE_ENV === 'development'` 时连 Auth 模拟器，`npm start` 起的生产构建拿不到模拟器签的 token，登不进去。改用 `npm run dev`，并注入 CSS 挡掉左下角的开发指示器，截图才干净：

```js
await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
```

拿登录态的做法——**只替换 Steam 换 token 这一次请求**，之后所有接口都打真后端、真写 Firestore：

1. 起 Firestore + Auth 模拟器与 API（见根目录 [CLAUDE.md](../../../CLAUDE.md) 的「本地开发」）
2. 用 firebase-admin 往模拟器里塞一个测试玩家，并给同一个 id 签一个 custom token。**必须在 `api/` 目录下执行**：`firebase-admin/app` 这类 subpath export 只能从 `api/node_modules` 解析，脚本放在别处、又用绝对路径执行时解析不到。用 `node -e` 直接跑，不落文件，也就不用记得删；token 写到 scratchpad：

   ```bash
   cd api && TOKEN_FILE=<scratchpad>/token.txt node -e "
   const { initializeApp } = require('firebase-admin/app');
   const { getFirestore } = require('firebase-admin/firestore');
   const { getAuth } = require('firebase-admin/auth');
   process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
   process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
   const S = '900000001';
   (async () => {
     const app = initializeApp({ projectId: 'windy10v10ai' });
     const db = getFirestore(app);
     await db.collection('Players').doc(S).set({
       id: S, matchCount: 862, winCount: 471, disconnectCount: 3,
       conductPoint: 10000, commendCount: 128, reportCount: 4, lastMatchTime: new Date(),
       seasonPointTotal: 39200, usedSeasonPoint: 0,
       memberPointTotal: 16900, usedMemberPoint: 0, usedLevel: 0,
     });
     await db.collection('PlayerProperty').doc(S).delete().catch(() => {});
     require('fs').writeFileSync(process.env.TOKEN_FILE, await getAuth(app).createCustomToken(S));
     process.exit(0);
   })();
   "
   ```

   `Players` 的字段以 `api/` 里的 entity 为准，新增了页面直接读的字段就补进来。要测会员态再往 `Members` 塞一条
3. Playwright 里拦掉换 token 的那一次请求，塞进上一步的 custom token：

   ```js
   await page.route('**/api/auth/steam/verify', (route) =>
     route.fulfill({
       status: 201,
       contentType: 'application/json',
       body: JSON.stringify({ customToken: TOKEN }),
     }),
   );
   await page.goto(`${BASE_URL}/login/callback?next=${encodeURIComponent(target)}`, { waitUntil: 'networkidle' });
   await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
   ```

4. 之后正常点按钮、填表单，用 `page.waitForResponse()` 确认请求方法与状态码，跑完直接查模拟器里的 Firestore 文档复核写入结果

做前后对比时，基线与本分支的 dev server 要同时跑在 3000 以外的端口，而 API 的 CORS 白名单只有 `http://localhost:3000`。在 Playwright 里代发 API 请求并补上跨域头，请求仍然打真后端：

```js
await page.route('http://localhost:3001/**', async (route) => {
  const response = await route.fetch();
  await route.fulfill({
    response,
    headers: {
      ...response.headers(),
      'access-control-allow-origin': new URL(BASE_URL).origin,
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    },
  });
});
```

四个坑：

- **测试玩家的字段要塞全**。页面会直接读 `matchCount.toLocaleString()` 这类字段，少一个就白屏，而报错只在 console 里
- **`next dev` 会往 `web/CLAUDE.md` 末尾追加 `<!-- BEGIN:nextjs-agent-rules -->` 一段**。提交前检查，只删这一段，不要 `git checkout --` 整个文件
- **登录态和未登录态都要过**。头部在两种状态下不是同一套元素，只测登录态会漏掉未登录才出现的布局问题
- **横排导航在窄屏是 `hidden md:flex`**，元素还在 DOM 里。按文案取元素时会命中不可见的那一个，定位要限定到具体区域

## 把 PR 截图交给子代理

拍 PR 截图（起基线、跑脚本、传 `assets` 分支、查链接）是机械劳动，可以派一个 sonnet 子代理去做，主会话省下的上下文用来看图和改文案。派之前主会话要先做完这两件事，否则子代理得自己摸索，反而更慢更容易出错：

- 本分支的服务、模拟器、测试数据、custom token 都就绪，基线目录也已经 `npm ci` 过，子代理只需要起基线那一个 server
- 驱动脚本已经在本分支跑通一遍，子代理只改输出目录

指令里要写死这几条，不要让它自己发挥：

- **哪些进程不许碰**：已经跑着的 dev server、API、模拟器一律不重启不 kill，也不许再跑 `npm run start`（会撞端口，`run-p` 连带把兄弟进程杀掉）
- **只在 `assets` 的 worktree 里 commit**，不许在主检出 commit 或切分支，推完把 worktree 删掉
- **图片路径带 PR 编号和版本号**，重拍换新版本目录，理由见 [web/CLAUDE.md](../../../web/CLAUDE.md) 的「PR 截图」
- **等长任务用前台 Bash 加大 timeout**（`timeout: 900000`），不要 `run_in_background`。子代理把等待丢到后台后会直接结束这一轮，要主会话再叫醒它，一来一回比直接等还慢

验收归主会话：数文件个数、抽查几条 raw 链接的状态码、挑一两张图看内容对不对。**刚推完的 raw 链接可能 404**，那是 CDN 缓存，隔一会儿重试，不要当成漏传。

## 例外：非 Playwright 路径

仅当当前会话跑在 Claude Desktop 里、且场景依赖真实登录态时，可以换用内置浏览器省一步登录；具体做法与更多限制见 [web/CLAUDE.md](../../../web/CLAUDE.md) 的「浏览器验证」。其他情况一律走上面的 Playwright 路径，它不依赖运行环境。
