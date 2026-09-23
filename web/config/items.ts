import ITEM_ASSETS from './items.json';

export interface NamedAsset {
  /** public/ 下对应目录里的图标文件名，带内容 hash；null 表示没取到 */
  icon: string | null;
  zh: string | null;
  en: string | null;
  ru: string | null;
}

const ITEMS = ITEM_ASSETS as Record<string, NamedAsset | undefined>;

export function itemAsset(itemName: string): NamedAsset | undefined {
  return ITEMS[itemName];
}

export function itemIconPath(icon: string): string {
  return `/items/${icon}`;
}

/** 自定义物品多半没有俄文，缺哪种语言落英文；清单里没有的退回内部名，好过显示空白 */
export function assetLabel(
  asset: NamedAsset | undefined,
  fallback: string,
  locale: string,
): string {
  const byLocale = asset?.[locale as 'zh' | 'en' | 'ru'];
  return byLocale ?? asset?.en ?? fallback;
}

export function itemLabel(itemName: string, locale: string): string {
  return assetLabel(itemAsset(itemName), itemName.replace(/^item_/, ''), locale);
}
