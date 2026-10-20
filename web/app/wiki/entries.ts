import { abilityAsset, abilityIconPath, abilityLabel } from '@/config/abilities';
import { itemAsset, itemIconPath, itemLabel, type NamedAsset } from '@/config/items';
import {
  WIKI_ABILITIES,
  WIKI_LOTTERY_ITEMS,
  WIKI_PRICE_TIERS,
  WIKI_SHOP_ITEMS,
} from '@/config/wiki';

import { tierLabel } from './tier';

/** 页面上一格要画的东西，名字已按当前语言取好；说明另行加载，见 app/components/WikiDetail.tsx */
export interface WikiEntry {
  key: string;
  /** 所在分区 */
  group: string;
  tier: number;
  label: string;
  /** 提示框标题下那一行，如「主动 · T4」「商店 · 12,500 金」 */
  tag: string;
  icon: string | null;
  /** 三语名字合在一起的小写串，搜索用 */
  search: string;
}

/** next-intl 服务端与客户端的 t 都满足，wiki 命名空间 */
export type WikiTranslate = (key: string, values?: Record<string, string | number>) => string;

// 搜索不分界面语言：玩家记得的可能是游戏里另一种语言的名字
const searchText = (asset: NamedAsset | undefined) =>
  [asset?.zh, asset?.en, asset?.ru].filter(Boolean).join('\n').toLowerCase();

export function abilityEntries(locale: string, t: WikiTranslate): WikiEntry[] {
  return WIKI_ABILITIES.map((entry) => {
    const asset = abilityAsset(entry.name);
    return {
      key: entry.name,
      group: entry.group,
      tier: entry.tier,
      label: abilityLabel(entry.name, locale),
      tag: `${t(`poolShort.${entry.group}`)} · ${tierLabel(entry.tier)}`,
      icon: asset?.icon ? abilityIconPath(asset.icon) : null,
      search: searchText(asset),
    };
  });
}

function itemEntry(name: string, locale: string) {
  const asset = itemAsset(name);
  return {
    key: name,
    label: itemLabel(name, locale),
    icon: asset?.icon ? itemIconPath(asset.icon) : null,
    search: searchText(asset),
  };
}

export function lotteryItemEntries(locale: string, t: WikiTranslate): WikiEntry[] {
  return WIKI_LOTTERY_ITEMS.map((entry) => ({
    ...itemEntry(entry.name, locale),
    group: 'all',
    tier: entry.tier,
    tag: t('tag.lottery', { tier: tierLabel(entry.tier) }),
  }));
}

export function shopItemEntries(locale: string, t: WikiTranslate): WikiEntry[] {
  return WIKI_SHOP_ITEMS.map((entry) => ({
    ...itemEntry(entry.name, locale),
    group: entry.section,
    tier: entry.tier,
    tag: entry.price === null ? t('tag.drop') : t('tag.shop', { price: entry.price }),
  }));
}

/** 商店价格档的标签，键是档位 */
export function priceTierLabels(t: WikiTranslate): Record<number, string> {
  const [a, b, c, d] = WIKI_PRICE_TIERS;
  return {
    1: t('price.below', { price: a }),
    2: t('price.range', { min: a, max: b }),
    3: t('price.range', { min: b, max: c }),
    4: t('price.range', { min: c, max: d }),
    5: t('price.above', { price: d }),
  };
}
