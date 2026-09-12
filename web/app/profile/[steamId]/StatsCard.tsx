'use client';

import { useTranslations } from 'next-intl';

import StatList from './StatList';

import type { PlayerInfo, StatsLifetime } from '@/app/lib/player-info';


const LIFETIME_KEYS = [
  'kills',
  'deaths',
  'assists',
  'lastHits',
  'totalGoldEarned',
  'heroDamage',
  'damageTaken',
  'healing',
  'towerKills',
] as const satisfies readonly (keyof StatsLifetime)[];

export default function StatsCard({ info }: { info: PlayerInfo }) {
  const t = useTranslations('profile.stats');
  const winRate = info.matchCount > 0 ? Math.round((info.winCount / info.matchCount) * 100) : 0;

  return (
    <section className="card-container space-y-4 p-6 sm:p-8">
      <h2 className="title-secondary">{t('title')}</h2>
      <StatList
        items={[
          { label: t('games'), value: info.matchCount.toLocaleString() },
          { label: t('winRate'), value: `${winRate}%` },
          { label: t('conduct'), value: String(info.conductPoint) },
          { label: t('conductNet'), value: String(info.commendCount - info.reportCount) },
        ]}
      />
      <StatList
        items={LIFETIME_KEYS.map((key) => ({
          label: t(key),
          value: (info.statsLifetime?.[key] ?? 0).toLocaleString(),
        }))}
      />
    </section>
  );
}
