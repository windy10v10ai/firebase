'use client';

import { ThumbsUp, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { PlayerInfo } from '@/app/lib/player-info';


export default function PlayerCard({ info }: { info: PlayerInfo }) {
  const t = useTranslations('profile.identity');
  const conductNet = info.commendCount - info.reportCount;

  return (
    <section className="card-container space-y-3 p-6 sm:p-8">
      <div className="flex size-16 items-center justify-center rounded-full border border-line bg-panel-soft">
        <UserRound className="size-8 text-muted" aria-hidden="true" />
      </div>
      <h1 className="title-primary">{info.id}</h1>
      <div className="flex items-center gap-1.5 text-content" title={t('conductNet')}>
        <ThumbsUp className="size-4 text-success" aria-hidden="true" />
        <span className="font-medium tabular-nums">{conductNet}</span>
        <span className="sr-only">{t('conductNet')}</span>
      </div>
    </section>
  );
}
