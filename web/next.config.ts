import createNextIntlPlugin from 'next-intl/plugin';

import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();

const apiOrigin = process.env.API_ORIGIN;
if (!apiOrigin) {
  throw new Error('API_ORIGIN is required to build the API proxy');
}

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  /*
   * 觉醒页的立绘与图标文件名都带内容 hash，内容一变文件名必变，所以可以永久缓存。
   * 不设的话 App Hosting 只给 max-age=14400，每 4 小时每个文件要回源问一次；
   * 而且它那个弱 ETag 实际只由文件大小决定，换成同样字节数的新图不会失效。
   */
  async headers() {
    return [
      {
        source: '/dota/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
  // 不只服务页面：其他来源也经本站域名进 API，清单见 docs/api/README.md
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
      // Firebase Auth 的登录与续期请求由 config/firebase.ts 指到本站域名，在这里转发出去。
      // 路径前缀是 SDK 拼出来的，不能改名
      {
        source: '/identitytoolkit.googleapis.com/:path*',
        destination: 'https://identitytoolkit.googleapis.com/:path*',
      },
      {
        source: '/securetoken.googleapis.com/:path*',
        destination: 'https://securetoken.googleapis.com/:path*',
      },
    ];
  },
};

export default withNextIntl(config);
