import { Noto_Sans_SC } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';

import Footer from './components/Footer';
import Header from './components/Header';
import { AuthProvider } from './lib/auth';
import { PLAYER_UID_COOKIE, parsePlayerUid } from './lib/auth-hint';

import './globals.css';

import type { Metadata } from 'next';

// 中文子集拆成上百个 unicode-range 分片，preload 会往每页塞上百个 <link>，
// 交给浏览器按页面实际用到的字形去取
const notoSansSC = Noto_Sans_SC({
  weight: ['400', '500', '700'],
  // 系统字体与 Noto Sans SC 字宽不同，中途换字体整页文字会跳；来不及就本次沿用系统字体，缓存后再用
  display: 'optional',
  preload: false,
  // 不点名 emoji 字体时，emoji 会落到最后兜底的那一份，字形画得比排版宽度宽，
  // 紧跟其后的汉字被压住
  fallback: [
    'system-ui',
    'sans-serif',
    'Apple Color Emoji',
    'Segoe UI Emoji',
    'Noto Color Emoji',
  ],
});

export const metadata: Metadata = {
  title: 'Windy10v10AI',
  description: 'DOTA2 10v10 AI custom by windy',
  icons: {
    icon: '/favicon.webp',
  },
};

// 同一份构建挂在多个域名下，Steam 回调地址要跟着玩家实际访问的域名走
async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = (headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '').split(',')[0].trim();
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const proto =
    headerList.get('x-forwarded-proto')?.split(',')[0].trim() ?? (isLocal ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = (await import(`../messages/${locale}.json`)).default;
  const initialUid = parsePlayerUid((await cookies()).get(PLAYER_UID_COOKIE)?.value);
  const siteOrigin = await requestOrigin();

  return (
    <html lang={locale}>
      <body className={`${notoSansSC.className} min-h-screen bg-surface`}>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <AuthProvider initialUid={initialUid} siteOrigin={siteOrigin}>
            <div className="relative z-10 flex flex-col min-h-screen">
              <Header />
              <main className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-4 sm:py-8 flex-1">{children}</main>
              <Footer />
            </div>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
