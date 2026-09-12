'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

// 单字标记取自 Google 翻译的约定，比语言名窄，且不需要先看懂某一种语言
const LOCALE_MARKS: { locale: string; mark: string }[] = [
  { locale: 'zh', mark: '文' },
  { locale: 'en', mark: 'A' },
];

export default function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('navigation');
  const router = useRouter();

  const toggleLocale = () => {
    const nextLocale = locale === 'zh' ? 'en' : 'zh';
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000`;
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={t('switchLanguage')}
      title={t('switchLanguage')}
      className="flex items-center rounded bg-gray-700 px-2 py-1 hover:bg-gray-600"
    >
      {LOCALE_MARKS.map(({ locale: markLocale, mark }, index) => (
        <span key={markLocale} className="flex items-center">
          {index > 0 ? <span className="mx-1 text-gray-500">/</span> : null}
          <span className={markLocale === locale ? 'text-white' : 'text-gray-400'}>{mark}</span>
        </span>
      ))}
    </button>
  );
}
