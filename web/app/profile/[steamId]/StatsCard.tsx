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

  const overview = [
    { label: t('games'), value: info.matchCount.toLocaleString() },
    { label: t('winRate'), value: `${winRate}%` },
    { label: t('conduct'), value: String(info.conductPoint) },
  ];

  return (
    <section className="card-container @container space-y-6 p-6 sm:p-8">
      <h2 className="title-secondary">{t('title')}</h2>
      <dl className="grid grid-cols-1 gap-3 @sm:grid-cols-3">
        {overview.map(({ label, value }) => (
          <div key={label} className="rounded-[10px] border border-line bg-panel-soft px-4 py-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-heading">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted">{t('lifetime')}</h3>
        <StatList
          items={LIFETIME_KEYS.map((key) => ({
            label: t(key),
            value: (info.statsLifetime?.[key] ?? 0).toLocaleString(),
          }))}
        />
      </div>
    </section>
  );
}
