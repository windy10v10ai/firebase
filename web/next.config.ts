import createNextIntlPlugin from 'next-intl/plugin';

import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();

const apiDomain = process.env.NEXT_PUBLIC_API_DOMAIN;
if (!apiDomain) {
  throw new Error('NEXT_PUBLIC_API_DOMAIN is required to build the API proxy');
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
  // 游戏客户端把 API 请求发到网站域名，由这里转发到 API。网站页面自身直连 API，不经过这条规则
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiDomain}/api/:path*`,
      },
    ];
  },
};

export default withNextIntl(config);
