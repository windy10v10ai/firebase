import { getLocale, getTranslations } from 'next-intl/server';

import { abilityLocale } from '@/app/lib/ability-text';
import { pageTitle } from '@/app/lib/page-title';
import { abilityAsset, abilityIconPath, abilityLabel } from '@/config/abilities';
import { WIKI_ABILITIES } from '@/config/wiki';

import WikiGrid, { type WikiEntry } from '../WikiGrid';

export const generateMetadata = pageTitle('wiki', 'pageTitle.abilities');

export default async function WikiAbilitiesPage() {
  const locale = abilityLocale(await getLocale());
  const t = await getTranslations('wiki');

  const entries: WikiEntry[] = WIKI_ABILITIES.map((entry) => {
    const asset = abilityAsset(entry.name);
    return {
      key: entry.name,
      group: entry.group,
      tier: entry.tier,
      label: abilityLabel(entry.name, locale),
      tag: `${t(`poolShort.${entry.group}`)} · T${entry.tier}`,
      icon: asset?.icon ? abilityIconPath(asset.icon) : null,
      // 搜索不分界面语言：玩家记得的可能是游戏里另一种语言的名字
      search: [asset?.zh, asset?.en, asset?.ru].filter(Boolean).join('\n').toLowerCase(),
    };
  });

  return (
    <WikiGrid
      kind="abilities"
      groups={[
        { key: 'active', title: t('pool.active') },
        { key: 'passive', title: t('pool.passive') },
      ]}
      entries={entries}
      locale={locale}
    />
  );
}
