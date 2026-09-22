// 单字标记认的是书写体系而不是国家，所以不用国旗，也不需要先看懂某一种语言
// compactNav 的语言导航文案太长，电脑档登录后也放不下六项，desktopOnly 的项在任何宽度都只进菜单
export const LOCALES = [
  { code: 'zh', mark: '文', name: '中文' },
  { code: 'en', mark: 'A', name: 'English' },
  { code: 'ru', mark: 'Я', name: 'Русский', compactNav: true },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(value: string | undefined): value is Locale {
  return LOCALES.some(({ code }) => code === value);
}
