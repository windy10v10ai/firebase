import { itemAsset, itemIconPath, itemLabel } from '@/config/items';
import MATCH_ITEMS from '@/config/match-items.json';

import type { WikiEntry } from '@/app/wiki/entries';

/** 战绩专用物品只提供标题与图标，说明在交互时另行加载。 */
export function matchItemEntries(locale: string): WikiEntry[] {
  return MATCH_ITEMS.items.map(({ name, price }) => {
    const asset = itemAsset(name);
    return {
      key: name,
      group: 'all',
      tier: 0,
      label: itemLabel(name, locale),
      tag: '',
      ...(price === null ? {} : { price }),
      icon: asset?.icon ? itemIconPath(asset.icon) : null,
      search: [asset?.zh, asset?.en, asset?.ru].filter(Boolean).join('\n').toLowerCase(),
    };
  });
}
