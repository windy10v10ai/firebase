// Dota 2 游戏客户端的网页控件中转页：控件创建时加载本页一次，之后只改网址 # 片段。
// 片段格式 <requestId>|<同源路径与查询>，请求结果经 document.title 以 <requestId>|<数据> 回传。
// 页面在哪个域名下打开就向哪个域名发请求。
// 就绪标题默认必须是 bridge|ready（线上客户端按全等判断），要国家码时才追加 |<国家码>。
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

// 国家码来自请求头，按两位大写字母白名单校验，非法按空处理，避免把头原样写进页面
export function buildProxyBridgePageHtml(withCountry: boolean, country?: string): string {
  const safeCountry = country && COUNTRY_CODE_PATTERN.test(country) ? country : '';
  const countrySuffix = withCountry ? '|' + safeCountry : '';
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>bridge|loading</title>
  </head>
  <body>
    <script>
      (function () {
        'use strict';
        var handled = '';

        function reply(requestId, data) {
          document.title = requestId + '|' + data;
        }

        function run() {
          var hash = decodeURIComponent(location.hash.replace(/^#/, ''));
          if (!hash || hash === handled) return;
          handled = hash;
          var separator = hash.indexOf('|');
          if (separator < 0) return;
          var requestId = hash.slice(0, separator);
          var path = hash.slice(separator + 1);
          if (path.indexOf('/api/proxy/') !== 0) {
            reply(requestId, 'ERR:bridge_bad_path');
            return;
          }
          fetch(path, { credentials: 'omit' })
            .then(function (response) {
              return response.text();
            })
            .then(function (text) {
              // 与 /api/proxy 现有响应一致：HTML 里的 <title> 就是 requestId|数据
              var parsed = new DOMParser().parseFromString(text, 'text/html');
              document.title = parsed.title;
            })
            .catch(function () {
              reply(requestId, 'ERR:bridge_fetch_failed');
            });
        }

        window.addEventListener('hashchange', run);
        document.title = 'bridge|ready${countrySuffix}';
        run();
      })();
    </script>
  </body>
</html>
`;
}
