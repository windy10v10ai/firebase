import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export const locales = ['en', 'zh'];
export const defaultLocale = 'en';

async function getBrowserLocale(): Promise<string> {
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language') || '';

  // 解析 Accept-Language 头
  const languages = acceptLanguage
    .split(',')
    .map((lang) => lang.split(';')[0].trim())
    .filter((lang) => lang.length > 0);
  // 检查是否支持中文
  const hasChinese = languages.some(
    (lang) =>
      lang.toLowerCase().startsWith('zh') ||
      lang.toLowerCase().startsWith('zh-cn') ||
      lang.toLowerCase().startsWith('zh-tw'),
  );

  return hasChinese ? 'zh' : 'en';
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;

  // 优先使用 cookie 中的语言设置，如果没有则使用浏览器语言
  const locale = cookieLocale || (await getBrowserLocale());

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
