import SLOT_ASSETS from './item-slots.json';
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

/** 游戏结算界面的空槽底图与通用配方图 */
export const EMPTY_SLOT_ICON = `/item-slots/${SLOT_ASSETS.empty}`;
export const RECIPE_ICON = `/item-slots/${SLOT_ASSETS.recipe}`;

/** 配方共用一张图，名字取它合成出的物品；返回 null 表示不是配方 */
export function recipeResult(itemName: string): string | null {
  return itemName.startsWith('item_recipe_') ? itemName.replace('item_recipe_', 'item_') : null;
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
