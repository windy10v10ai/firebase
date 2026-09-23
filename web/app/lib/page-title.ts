import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

export const SITE_NAME = 'Windy10v10AI';
export const TITLE_TEMPLATE = `%s | ${SITE_NAME}`;

/** 按当前语言取页面名作为标签页标题，品牌后缀由上层 layout 的模板拼接 */
export function pageTitle(namespace: string, key: string) {
  return async (): Promise<Metadata> => {
    const t = await getTranslations(namespace);
    // 字符串形式的 title 会让下层路由丢掉模板，带下层页面的 layout 也要能拼上后缀
    return { title: { default: t(key), template: TITLE_TEMPLATE } };
  };
}
