import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, isLocale, type Locale } from './locales';
import { loadMessages } from './messages';

// 按 Accept-Language 自己的排序取第一个支持的语言：排在前面的就是玩家更想要的那种
async function getBrowserLocale(): Promise<Locale> {
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language') ?? '';
  const languages = acceptLanguage
    .split(',')
    .map((language) => language.split(';')[0].trim().toLowerCase())
    .filter((language) => language.length > 0);

  for (const language of languages) {
    const matched = LOCALES.find(
      ({ code }) => language === code || language.startsWith(`${code}-`),
    );
    if (matched) {
      return matched.code;
    }
  }

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  // cookie 的值可以被手工改成任意字符串，不校验就会去 import 一个不存在的语言文件
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : await getBrowserLocale();

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
