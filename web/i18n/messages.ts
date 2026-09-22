import enMessages from '../messages/en.json';

import { DEFAULT_LOCALE, type Locale } from './locales';

type Messages = Record<string, unknown>;

function isPlainObject(value: unknown): value is Messages {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function merge(base: Messages, overrides: Messages): Messages {
  const merged: Messages = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    merged[key] = isPlainObject(current) && isPlainObject(value) ? merge(current, value) : value;
  }
  return merged;
}

// 一种语言可以只译一部分，没译到的 key 落回英文，未完成的页面照常出字而不是整页报错
export async function loadMessages(locale: Locale): Promise<Messages> {
  const base = enMessages as Messages;
  if (locale === DEFAULT_LOCALE) {
    return base;
  }
  const overrides = (await import(`../messages/${locale}.json`)).default as Messages;
  return merge(base, overrides);
}
