'use client';

import { ThumbsUp, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';

import type { PlayerInfo } from '@/app/lib/player-info';

/** ID 取自地址，数据没到也能先显示 */
export default function PlayerCard({ steamId, info }: { steamId: string; info: PlayerInfo | null }) {
  const t = useTranslations('profile.identity');

  return (
    <section className="card-container card-pad space-y-4">
      <div className="flex size-20 items-center justify-center rounded-full border border-line bg-panel-soft">
        <UserRound className="size-10 text-muted" aria-hidden="true" />
      </div>
      <h1 className="title-primary">{steamId}</h1>
      <div className="flex items-center gap-1.5 text-content" title={t('conductNet')}>
        <ThumbsUp className="size-4 text-success" aria-hidden="true" />
        <span className="font-medium tabular-nums">
          {info ? info.commendCount - info.reportCount : <Skeleton />}
        </span>
        <span className="sr-only">{t('conductNet')}</span>
      </div>
    </section>
  );
}
