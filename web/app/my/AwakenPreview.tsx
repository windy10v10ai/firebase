'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import SteamLoginButton from '@/app/components/SteamLoginButton';
import AwakenCard from '@/app/profile/[steamId]/awaken/AwakenCard';
import AwakenDialog from '@/app/profile/[steamId]/awaken/AwakenDialog';
import AwakenRules from '@/app/profile/[steamId]/awaken/AwakenRules';
import { AWAKEN_HEROES, type AwakenHero } from '@/config/awaken';

const BOX_CLASS = 'box-pad flex rounded-lg border border-line bg-control';

/** 未登录时的觉醒页：英雄与技能来自本地配置，点开只看技能，觉醒要先登录 */
export default function AwakenPreview() {
  const t = useTranslations('awaken');
  const [target, setTarget] = useState<AwakenHero | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="title-primary">{t('title')}</h1>

      <AwakenRules />

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className={`${BOX_CLASS} items-baseline justify-between gap-3 lg:flex-1`}>
          <span className="text-base text-muted">{t('preview.heroCount')}</span>
          <span className="text-3xl leading-none font-bold text-heading">
            {AWAKEN_HEROES.length}
          </span>
        </div>
        <div
          className={`${BOX_CLASS} flex-col gap-3 md:flex-row md:items-center md:justify-between lg:flex-2 lg:py-2`}
        >
          <span className="text-sm text-muted">{t('preview.hint')}</span>
          <SteamLoginButton size="wide" className="w-full md:w-auto" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {AWAKEN_HEROES.map((hero) => (
          <AwakenCard
            key={hero.heroName}
            hero={hero}
            unlocked={false}
            tooPoor={false}
            busy={false}
            preview
            onOpen={setTarget}
          />
        ))}
      </div>

      <AwakenDialog
        hero={target}
        unlocked={false}
        fromRandom={false}
        busy={false}
        useableSeasonPoint={0}
        useableMemberPoint={0}
        preview
        onClose={() => setTarget(null)}
        onConfirm={() => {}}
      />
    </div>
  );
}
