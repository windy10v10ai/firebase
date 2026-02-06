import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
};

export default withNextIntl(config); 