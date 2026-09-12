'use client';

import { useTranslations } from 'next-intl';

import StatList from './StatList';

import type { PlayerInfo } from '@/app/lib/player-info';


export default function IdentityCard({ info }: { info: PlayerInfo }) {
  const t = useTranslations('profile.identity');

  return (
    <section className="card-container space-y-4 p-6 sm:p-8">
      <h1 className="title-primary">{t('heading', { id: info.id })}</h1>
      <StatList
        items={[
          { label: t('battleLevel'), value: String(info.seasonLevel) },
          { label: t('memberLevel'), value: String(info.memberLevel) },
          { label: t('battlePoint'), value: info.useableSeasonPoint.toLocaleString() },
          { label: t('memberPoint'), value: info.useableMemberPoint.toLocaleString() },
        ]}
      />
    </section>
  );
}
