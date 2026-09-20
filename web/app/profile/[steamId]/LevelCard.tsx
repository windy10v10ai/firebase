'use client';

import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';

import type { PlayerInfo } from '@/app/lib/player-info';

interface CurrencyValues {
  level: number;
  pointTotal: number;
  currentLevelPoint: number;
  nextLevelPoint: number;
  usablePoint: number;
}

interface CurrencyBlockProps {
  tone: 'season' | 'member';
  t: ReturnType<typeof useTranslations>;
  levelLabel: string;
  /** 数据没到时为 null */
  values: CurrencyValues | null;
}

const TONE_TEXT = {
  season: 'text-season',
  member: 'text-member',
} as const;

const TONE_BAR = {
  season: 'bg-season-strong',
  member: 'bg-member-strong',
} as const;

const TONE_BORDER = {
  season: 'border-season-border',
  member: 'border-member-border',
} as const;

function CurrencyBlock({ tone, t, levelLabel, values }: CurrencyBlockProps) {
  // 满级或数据异常时不强行显示负数进度
  const progress = !values
    ? 0
    : values.nextLevelPoint > 0
      ? Math.min(100, Math.max(0, (values.currentLevelPoint / values.nextLevelPoint) * 100))
      : 100;
  const remaining = values ? Math.max(0, values.nextLevelPoint - values.currentLevelPoint) : 0;
  const cumulativeText = t('cumulative', { total: (values?.pointTotal ?? 0).toLocaleString() });
  const remainingText = t('remainingToLevel', {
    level: (values?.level ?? 0) + 1,
    amount: remaining.toLocaleString(),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-content">{levelLabel}</span>
        <span className={`text-3xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>
          {values ? values.level : <Skeleton>000</Skeleton>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-panel-soft">
        <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${progress}%` }} />
      </div>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{values ? cumulativeText : <Skeleton>{cumulativeText}</Skeleton>}</span>
        <span>{values ? remainingText : <Skeleton>{remainingText}</Skeleton>}</span>
      </div>
      <div
        className={`flex items-center justify-between rounded-[7px] border-l-2 bg-panel-soft py-2 pl-3 pr-4 ${TONE_BORDER[tone]}`}
      >
        <span className="text-content">{t('usablePoints')}</span>
        <span className={`text-xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>
          {values ? values.usablePoint.toLocaleString() : <Skeleton>000,000</Skeleton>}
        </span>
      </div>
    </div>
  );
}

export default function LevelCard({ info }: { info: PlayerInfo | null }) {
  const t = useTranslations('profile.identity');

  return (
    <section className="card-container card-pad h-full">
      <div className="grid gap-6 @container md:grid-cols-2">
        <CurrencyBlock
          tone="season"
          t={t}
          levelLabel={t('battleLevel')}
          values={
            info && {
              level: info.seasonLevel,
              pointTotal: info.seasonPointTotal,
              currentLevelPoint: info.seasonCurrrentLevelPoint,
              nextLevelPoint: info.seasonNextLevelPoint,
              usablePoint: info.useableSeasonPoint,
            }
          }
        />
        <CurrencyBlock
          tone="member"
          t={t}
          levelLabel={t('memberLevel')}
          values={
            info && {
              level: info.memberLevel,
              pointTotal: info.memberPointTotal,
              currentLevelPoint: info.memberCurrentLevelPoint,
              nextLevelPoint: info.memberNextLevelPoint,
              usablePoint: info.useableMemberPoint,
            }
          }
        />
      </div>
    </section>
  );
}
