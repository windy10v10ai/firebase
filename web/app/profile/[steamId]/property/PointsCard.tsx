'use client';

import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { playerPagePath } from '@/app/lib/player-path';

interface PointsCardProps {
  steamId: string;
  /** 扣掉待提交的档数之后还剩多少 */
  usableLevel: number;
  totalLevel: number;
  seasonLevel: number;
  memberLevel: number;
  onReset: () => void;
}

const BOX_CLASS =
  'flex flex-1 items-baseline justify-between gap-3 rounded-lg border border-line bg-control px-4 py-3.5';

export default function PointsCard({
  steamId,
  usableLevel,
  totalLevel,
  seasonLevel,
  memberLevel,
  onReset,
}: PointsCardProps) {
  const t = useTranslations('property.points');
  const profileHref = playerPagePath(steamId);

  return (
    <section className="card-container flex flex-col gap-4 p-6 sm:px-8">
      <div className="flex items-center gap-3">
        <h2 className="title-secondary">{t('title')}</h2>
        <button
          type="button"
          onClick={onReset}
          className="ml-auto flex min-h-11 items-center gap-2 rounded-[7px] border border-danger/50 bg-danger/8 px-4 text-sm text-danger transition-colors hover:bg-danger/15"
        >
          <RotateCcw className="size-4" />
          {t('reset')}
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className={BOX_CLASS}>
          <span className="text-sm text-muted">{t('usable')}</span>
          <span className="flex items-baseline gap-1">
            <span className="text-2xl leading-none font-bold text-heading">{usableLevel}</span>
            <span className="leading-none font-bold text-muted">/ {totalLevel}</span>
          </span>
        </div>
        <Link href={profileHref} className={`${BOX_CLASS} card-hover`}>
          <span className="text-sm text-muted">{t('battleLevel')}</span>
          <span className="text-2xl leading-none font-bold text-season">{seasonLevel}</span>
        </Link>
        <Link href={profileHref} className={`${BOX_CLASS} card-hover`}>
          <span className="text-sm text-muted">{t('memberLevel')}</span>
          <span className="text-2xl leading-none font-bold text-member-strong">{memberLevel}</span>
        </Link>
      </div>

      <p className="border-t border-line pt-3.5 text-sm text-muted">{t('formula')}</p>
    </section>
  );
}
