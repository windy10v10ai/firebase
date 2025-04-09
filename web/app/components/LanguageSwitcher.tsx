'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations();

  const switchLocale = (newLocale: string) => {
    // 使用 __session cookie
    document.cookie = `__session=NEXT_LOCALE=${newLocale}; path=/; secure; sameSite=strict`;

    router.refresh();
  };

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={() => switchLocale('en')}
        className={`px-2 py-1 rounded ${
          locale === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        English
      </button>
      <button
        onClick={() => switchLocale('zh')}
        className={`px-2 py-1 rounded ${
          locale === 'zh' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        中文
      </button>
    </div>
  );
}
