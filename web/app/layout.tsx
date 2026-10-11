import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

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
import { requestOrigin } from './lib/request-origin';
import { SHARE_IMAGE } from './lib/share-card';

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

// 链接贴进聊天软件时显示的通用卡片，og:title 由 Next 取自标签页标题
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shareCard');
  return {
    metadataBase: new URL(await requestOrigin()),
    title: { default: SITE_NAME, template: TITLE_TEMPLATE },
    description: t('siteDescription'),
    icons: {
      icon: '/images/launcher.webp',
    },
    openGraph: { type: 'website', siteName: SITE_NAME, images: [SHARE_IMAGE] },
    twitter: { card: 'summary' },
  };
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
