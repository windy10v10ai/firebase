import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();

const config: NextConfig = {
  // 其他 Next.js 配置
};

export default withNextIntl(config); 