'use client';

import { useTranslations } from 'next-intl';

import type { PlayerInfo } from '@/app/lib/player-info';

interface CurrencyBlockProps {
  tone: 'season' | 'member';
  t: ReturnType<typeof useTranslations>;
  levelLabel: string;
  level: number;
  pointTotal: number;
  currentLevelPoint: number;
  nextLevelPoint: number;
  usablePoint: number;
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

function CurrencyBlock({
  tone,
  t,
  levelLabel,
  level,
  pointTotal,
  currentLevelPoint,
  nextLevelPoint,
  usablePoint,
}: CurrencyBlockProps) {
  // 满级或数据异常时不强行显示负数进度
  const progress =
    nextLevelPoint > 0 ? Math.min(100, Math.max(0, (currentLevelPoint / nextLevelPoint) * 100)) : 100;
  const remaining = Math.max(0, nextLevelPoint - currentLevelPoint);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-content">{levelLabel}</span>
        <span className={`text-3xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{level}</span>
      </div>
      <div className="h-1.5 rounded-full bg-panel-soft">
        <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${progress}%` }} />
      </div>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{t('cumulative', { total: pointTotal.toLocaleString() })}</span>
        <span>{t('remainingToLevel', { level: level + 1, amount: remaining.toLocaleString() })}</span>
      </div>
      <div
        className={`flex items-center justify-between rounded-[7px] border-l-2 bg-panel-soft py-2 pl-3 pr-4 ${TONE_BORDER[tone]}`}
      >
        <span className="text-content">{t('usablePoints')}</span>
        <span className={`text-xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>
          {usablePoint.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export default function LevelCard({ info }: { info: PlayerInfo }) {
  const t = useTranslations('profile.identity');

  return (
    <section className="card-container space-y-6 p-6 sm:p-8">
      <div className="grid gap-6 @container sm:grid-cols-2">
        <CurrencyBlock
          tone="season"
          t={t}
          levelLabel={t('battleLevel')}
          level={info.seasonLevel}
          pointTotal={info.seasonPointTotal}
          currentLevelPoint={info.seasonCurrrentLevelPoint}
          nextLevelPoint={info.seasonNextLevelPoint}
          usablePoint={info.useableSeasonPoint}
        />
        <CurrencyBlock
          tone="member"
          t={t}
          levelLabel={t('memberLevel')}
          level={info.memberLevel}
          pointTotal={info.memberPointTotal}
          currentLevelPoint={info.memberCurrentLevelPoint}
          nextLevelPoint={info.memberNextLevelPoint}
          usablePoint={info.useableMemberPoint}
        />
      </div>
      <div className="flex items-center justify-between border-t border-line pt-4">
        <div>
          <div className="text-content">{t('attributePoints')}</div>
          <div className="text-sm text-muted">{t('attributePointsHint')}</div>
        </div>
        <span className="text-2xl font-bold tabular-nums text-heading">{info.useableLevel}</span>
      </div>
    </section>
  );
}
