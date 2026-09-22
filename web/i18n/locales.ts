// 单字标记认的是书写体系而不是国家，所以不用国旗，也不需要先看懂某一种语言
export const LOCALES = [
  { code: 'zh', mark: '文', name: '中文' },
  { code: 'en', mark: 'A', name: 'English' },
  { code: 'ru', mark: 'Я', name: 'Русский' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(value: string | undefined): value is Locale {
  return LOCALES.some(({ code }) => code === value);
}
