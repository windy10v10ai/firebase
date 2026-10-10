import { getLocale } from 'next-intl/server';

import { abilityLocale } from '@/app/lib/ability-text';
import { pageTitle } from '@/app/lib/page-title';
import { itemAsset, itemIconPath, itemLabel } from '@/config/items';
import { WIKI_ITEMS } from '@/config/wiki';

import WikiGrid, { type WikiEntry } from '../WikiGrid';

export const generateMetadata = pageTitle('wiki', 'pageTitle.items');

export default async function WikiItemsPage() {
  const locale = abilityLocale(await getLocale());

  const entries: WikiEntry[] = WIKI_ITEMS.map((entry) => {
    const asset = itemAsset(entry.name);
    return {
      key: entry.name,
      group: entry.group,
      tier: entry.tier,
      label: itemLabel(entry.name, locale),
      tag: `T${entry.tier}`,
      icon: asset?.icon ? itemIconPath(asset.icon) : null,
      // 搜索不分界面语言：玩家记得的可能是游戏里另一种语言的名字
      search: [asset?.zh, asset?.en, asset?.ru].filter(Boolean).join('\n').toLowerCase(),
    };
  });

  return (
    <WikiGrid
      kind="items"
      groups={[{ key: 'all', title: null }]}
      entries={entries}
      locale={locale}
    />
  );
}
