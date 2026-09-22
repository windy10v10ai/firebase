'use client';

import { useTranslations } from 'next-intl';

import InfoPopover from '@/app/components/InfoPopover';
import Skeleton from '@/app/components/ui/skeleton';

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

const CONDUCT_LOW_THRESHOLD = 60;
const CONDUCT_WATCH_THRESHOLD = 80;
const CONDUCT_EXCELLENT_THRESHOLD = 110;

const CONDUCT_TIERS = [
  { key: 'tierExcellent', multiplier: '×1.1', colorClass: 'text-success', dotClass: 'bg-success' },
  { key: 'tierNormal', multiplier: '×1.0', colorClass: 'text-heading', dotClass: 'bg-heading' },
  { key: 'tierWatch', multiplier: '×0.8', colorClass: 'text-warning', dotClass: 'bg-warning' },
  { key: 'tierLow', multiplier: '×0.5', colorClass: 'text-danger', dotClass: 'bg-danger' },
] as const;

/** 分数越偏离基准越显眼；80-109 含默认起始值，用默认字色不额外强调 */
function conductColorClass(score: number): string | undefined {
  if (score < CONDUCT_LOW_THRESHOLD) {
    return 'text-danger';
  }
  if (score < CONDUCT_WATCH_THRESHOLD) {
    return 'text-warning';
  }
  if (score >= CONDUCT_EXCELLENT_THRESHOLD) {
    return 'text-success';
  }
  return undefined;
}

export default function StatsCard({ info }: { info: PlayerInfo | null }) {
  const t = useTranslations('profile.stats');

  const overview = [
    { label: t('games'), value: info ? info.matchCount.toLocaleString() : null },
    {
      label: t('winRate'),
      value: info
        ? `${info.matchCount > 0 ? Math.round((info.winCount / info.matchCount) * 100) : 0}%`
        : null,
    },
  ];

  const positive = (chunks: React.ReactNode) => <b className="text-success">{chunks}</b>;
  const negative = (chunks: React.ReactNode) => <b className="text-danger">{chunks}</b>;

  return (
    <section className="card-container card-pad @container space-y-6">
      <h2 className="title-secondary">{t('title')}</h2>
      <dl className="grid grid-cols-1 gap-3 @sm:grid-cols-3">
        {overview.map(({ label, value }) => (
          <div key={label} className="box-pad rounded-[10px] border border-line bg-panel-soft">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-heading">{value ?? <Skeleton />}</dd>
          </div>
        ))}
        <div className="box-pad rounded-[10px] border border-line bg-panel-soft">
          <dt className="flex items-center gap-1.5 text-sm text-muted">
            {t('conduct')}
            <InfoPopover label={t('conductInfo.ariaLabel')}>
              <p className="text-content">{t('conductInfo.intro')}</p>
              <div className="mt-3 flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">{t('conductInfo.changesTitle')}</span>
                <p className="leading-relaxed text-content">
                  • {t.rich('conductInfo.changesFinish', { pos: positive })}
                  <br />• {t.rich('conductInfo.changesEarlyLeave', { neg: negative })}
                  <br />• {t.rich('conductInfo.changesCommend', { pos: positive, neg: negative })}
                </p>
              </div>
              <div className="mt-3 border-t border-line-strong pt-3">
                <span className="text-xs font-medium text-muted">{t('conductInfo.multiplierTitle')}</span>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {CONDUCT_TIERS.map(({ key, multiplier, colorClass, dotClass }) => (
                    <li key={key} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-content">
                        <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                        {t(`conductInfo.${key}`)}
                      </span>
                      <span className={`font-bold tabular-nums ${colorClass}`}>{multiplier}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </InfoPopover>
          </dt>
          <dd
            className={`mt-1 text-2xl font-bold tabular-nums ${info ? (conductColorClass(info.conductPoint) ?? 'text-heading') : 'text-heading'}`}
          >
            {info ? String(info.conductPoint) : <Skeleton />}
          </dd>
        </div>
      </dl>
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted">{t('lifetime')}</h3>
        <StatList
          items={LIFETIME_KEYS.map((key) => ({
            label: t(key),
            value: info ? (info.statsLifetime?.[key] ?? 0).toLocaleString() : null,
          }))}
        />
      </div>
    </section>
  );
}
