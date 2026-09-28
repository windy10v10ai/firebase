'use client';

import { useTranslations } from 'next-intl';

import CurrencyBlock from '@/app/components/CurrencyBlock';

import type { PlayerInfo } from '@/app/lib/player-info';

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
