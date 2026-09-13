---
name: web-browser-verify
description: web/ 改动涉及页面行为时，用 Playwright 驱动无头 Chrome 做真实点击/截图/console 检查
---

# 用 Playwright 验证 web/ 的页面行为

适用场景见 [web/CLAUDE.md](../../../web/CLAUDE.md) 的「浏览器验证」——只要改动会影响网站页面行为，就要走这里，curl、控制台 `fetch`、unit、e2e 都不能替代。

## 步骤

1. 生产构建起服务：`cd web && npm run build && npm start`（不要用 dev server，左下角开发指示器会入镜）
2. 在 `web/.browser-verify/`（已被 `.gitignore` 排除，跑完不用清理）下写一次性驱动脚本，`require('../scripts/browser-verify')` 引入公共部分
3. 按 [web/CLAUDE.md](../../../web/CLAUDE.md) 的「验证宽度」逐档过：375/768/1280
4. 真实交互用 `page.click()` / `page.fill()`，不要 `eval el.value = ...`——React 受控输入的 `onChange` 不会被后者触发
5. 每档用 `page.screenshot()` 存到 `web/.browser-verify/screenshots/`，后续贴 PR 时按 [web/CLAUDE.md](../../../web/CLAUDE.md) 的「PR 截图」一节操作
6. 每档检查 `withPage` 返回的 console 错误数组，非空就是回归。**`MISSING_MESSAGE` 要当回归看**——i18n key 缺失不会让页面崩，只会渲染成空白或 key 本身，肉眼扫截图看不出来，只有 console 里有
7. **改动碰到界面文案时，中英文各过一遍**，不要只看默认语言。语言取自 `NEXT_LOCALE` cookie，没有就按 `Accept-Language` 判，见 [web/i18n/request.ts](../../../web/i18n/request.ts)：

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

  for (const name of ['375', '768', '1280']) {
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

## Claude Desktop 环境下的可选捷径

如果当前会话运行在 Claude Desktop 里，且要测的场景依赖真实登录态，可以改用内置浏览器（`mcp__Claude_Browser__*`）省一步登录，用法见 [web/CLAUDE.md](../../../web/CLAUDE.md)。其他情况——包括 CLI、VSCode 插件、CI——一律走上面的 Playwright 路径，它不依赖运行环境。
