import localFont from 'next/font/local';
import { cookies, headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import Analytics from './components/Analytics';
import Footer from './components/Footer';
import Header from './components/Header';
import { AuthProvider } from './lib/auth';
import {
  PLAYER_PROFILE_COOKIE,
  PLAYER_UID_COOKIE,
  parsePlayerProfileHint,
  parsePlayerUid,
} from './lib/auth-hint';
import { SITE_NAME, TITLE_TEMPLATE } from './lib/page-title';
import { QueryProvider } from './lib/query-client';

import './globals.css';

import type { Metadata } from 'next';

// 只收了顶栏与页面大标题的字，正文与玩家昵称用系统字体，见 scripts/heading-font.mjs
const headingFont = localFont({
  src: './fonts/heading.woff2',
  weight: '400 700',
  // 文件小且预加载，等它就绪再画标题，从地址栏打开时不会先画系统字体再替换
  display: 'block',
  variable: '--font-heading-face',
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: TITLE_TEMPLATE },
  description: 'DOTA2 10v10 AI custom by windy',
  icons: {
    icon: '/images/launcher.webp',
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
  const messages = await getMessages();
  const cookieStore = await cookies();
  const initialUid = parsePlayerUid(cookieStore.get(PLAYER_UID_COOKIE)?.value);
  const initialProfile = parsePlayerProfileHint(
    cookieStore.get(PLAYER_PROFILE_COOKIE)?.value,
    initialUid,
  );
  const siteOrigin = await requestOrigin();

  return (
    <html lang={locale} className={headingFont.variable}>
      <body className="min-h-screen bg-surface">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <AuthProvider initialUid={initialUid} initialProfile={initialProfile} siteOrigin={siteOrigin}>
            <QueryProvider>
              <div className="relative z-10 flex flex-col min-h-screen">
                <Header />
                <main className="mx-auto w-full max-w-7xl px-3 py-6 md:px-4 md:py-8 flex-1">{children}</main>
                <Footer />
              </div>
            </QueryProvider>
          </AuthProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
