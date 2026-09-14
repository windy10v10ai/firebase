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
  // 游戏客户端把 API 请求发到网站域名，由这里转发到 API。网站页面自身直连 API，不经过这条规则
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiDomain}/api/:path*`,
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
