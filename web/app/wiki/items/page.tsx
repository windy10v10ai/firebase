import { getLocale, getTranslations } from 'next-intl/server';

import { abilityLocale } from '@/app/lib/ability-text';
import { pageTitle } from '@/app/lib/page-title';

import { lotteryItemEntries, priceTierLabels, shopItemEntries } from '../entries';
import { tierLabel } from '../tier';
import WikiGrid from '../WikiGrid';

export const generateMetadata = pageTitle('wiki', 'pageTitle.items');

const TIER_LABELS = Object.fromEntries([1, 2, 3, 4, 5].map((tier) => [tier, tierLabel(tier)]));

export default async function WikiItemsPage() {
  const locale = abilityLocale(await getLocale());
  const t = await getTranslations('wiki');

  return (
    <WikiGrid
      kind="items"
      categories={[
        {
          key: 'shop',
          label: t('category.shop'),
          groups: [
            {
              key: 'equipment',
              title: t('section.equipment'),
              tierLabels: priceTierLabels(t),
              priced: true,
            },
            { key: 'consumable', title: t('section.consumable'), tierLabels: null },
            { key: 'drop', title: t('section.drop'), tierLabels: null },
          ],
          entries: shopItemEntries(locale, t),
        },
        {
          key: 'lottery',
          label: t('category.lottery'),
          groups: [{ key: 'all', title: null, tierLabels: TIER_LABELS }],
          entries: lotteryItemEntries(locale, t),
        },
      ]}
      locale={locale}
    />
  );
}
