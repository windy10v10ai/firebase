import { getLocale, getTranslations } from 'next-intl/server';

import { abilityLocale } from '@/app/lib/ability-text';
import { pageTitle } from '@/app/lib/page-title';

import { abilityEntries } from '../entries';
import { tierLabel } from '../tier';
import WikiGrid from '../WikiGrid';

export const generateMetadata = pageTitle('wiki', 'pageTitle.abilities');

const TIER_LABELS = Object.fromEntries([1, 2, 3, 4, 5].map((tier) => [tier, tierLabel(tier)]));

export default async function WikiAbilitiesPage() {
  const locale = abilityLocale(await getLocale());
  const t = await getTranslations('wiki');

  return (
    <WikiGrid
      kind="abilities"
      categories={[
        {
          key: 'lottery',
          label: t('category.lottery'),
          groups: [
            { key: 'active', title: t('pool.active'), tierLabels: TIER_LABELS },
            { key: 'passive', title: t('pool.passive'), tierLabels: TIER_LABELS },
          ],
          entries: abilityEntries(locale, t),
        },
      ]}
      locale={locale}
    />
  );
}
