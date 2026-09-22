'use client';

import { Check, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { LOCALES, LOCALE_COOKIE, type Locale } from '@/i18n/locales';

const LOCALE_COOKIE_MAX_AGE = 31536000;

// 写在组件外：react-hooks/immutability 不允许在组件内部改 document 这类外部值
function persistLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}`;
}

export default function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('navigation');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 列表浮在内容上方，点到页面别处或按 Esc 都应该关掉
  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const selectLocale = (nextLocale: Locale) => {
    setOpen(false);
    persistLocale(nextLocale);
    router.refresh();
  };

  const currentMark = LOCALES.find(({ code }) => code === locale)?.mark;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('switchLanguage')}
        title={t('switchLanguage')}
        aria-expanded={open}
        aria-controls="language-menu"
        // 28px 高，量出的上限见 phase-2g-header-layout.md 的宽度约束
        className="flex h-7 items-center gap-1 rounded border border-line bg-control px-1 text-sm text-content transition-colors hover:bg-control-hover"
      >
        <Globe className="size-[15px] shrink-0" strokeWidth={1.7} aria-hidden="true" />
        <span className="text-heading">{currentMark}</span>
      </button>
      {open ? (
        <div
          id="language-menu"
          className="absolute right-0 top-full z-20 mt-1 w-44 rounded-[10px] border border-line bg-panel p-1"
        >
          {LOCALES.map(({ code, name }) => {
            const isCurrent = code === locale;
            return (
              <button
                key={code}
                type="button"
                onClick={() => selectLocale(code)}
                aria-current={isCurrent ? 'true' : undefined}
                className={`flex min-h-11 w-full items-center gap-2 rounded-[7px] px-2.5 transition-colors ${
                  isCurrent
                    ? 'bg-panel-soft text-heading'
                    : 'text-content hover:bg-panel-soft hover:text-heading'
                }`}
              >
                <Check
                  className={`size-4 shrink-0 ${isCurrent ? '' : 'invisible'}`}
                  aria-hidden="true"
                />
                {/* 语言名一律用它自己的写法：看不懂当前界面的人才最需要这份列表 */}
                <span className="flex-1 text-left">{name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
