import type { AwakenText } from '@/config/awaken';

export type AbilityLocale = 'zh' | 'en' | 'ru';

/** 觉醒数据只有中英两份，wiki 有三份；没有俄文的按网站规则落英文 */
export function pickText(text: AwakenText & { ru?: string }, locale: AbilityLocale): string {
  return (locale === 'ru' ? text.ru : text[locale]) ?? text.en;
}

/** 界面语言收窄到技能文本有的三种，其余落英文 */
export function abilityLocale(locale: string): AbilityLocale {
  return locale === 'zh' || locale === 'ru' ? locale : 'en';
}
