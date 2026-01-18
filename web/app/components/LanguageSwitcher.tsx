'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  const switchLocale = (newLocale: string) => {
    // 设置 cookie
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
    // 刷新页面以应用新的语言设置
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
