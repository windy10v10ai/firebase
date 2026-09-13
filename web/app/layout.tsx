import { Noto_Sans_SC } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';

import Footer from './components/Footer';
import Header from './components/Header';
import { AuthProvider } from './lib/auth';

import './globals.css';

import type { Metadata } from 'next';

// 中文子集拆成上百个 unicode-range 分片，preload 会往每页塞上百个 <link>，
// 交给浏览器按页面实际用到的字形去取
const notoSansSC = Noto_Sans_SC({
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'Windy10v10AI',
  description: 'DOTA2 10v10 AI custom by windy',
  icons: {
    icon: '/favicon.webp',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = (await import(`../messages/${locale}.json`)).default;

  return (
    <html lang={locale}>
      <body className={`${notoSansSC.className} min-h-screen bg-surface`}>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <AuthProvider>
            <div className="relative z-10 flex flex-col min-h-screen">
              <Header />
              <main className="container mx-auto px-4 py-8 flex-1">{children}</main>
              <Footer />
            </div>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
