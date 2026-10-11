'use client';

/* eslint-disable @next/next/no-img-element -- 觉醒的立绘与图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU */

import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import AbilityDetails from '@/app/components/AbilityDetails';
import AbilityDialog from '@/app/components/AbilityDialog';
import GameText from '@/app/components/GameText';
import { abilityLocale } from '@/app/lib/ability-text';
import {
  AWAKEN_MEMBER_POINT_COST,
  AWAKEN_RANDOM_MEMBER_POINT_COST,
  AWAKEN_RANDOM_SEASON_POINT_COST,
  AWAKEN_SEASON_POINT_COST,
  awakenAssetPath,
} from '@/app/lib/awaken';

import type { AwakenHero } from '@/config/awaken';

interface AwakenDialogProps {
  hero: AwakenHero | null;
  unlocked: boolean;
  /** 从随机候选进来的走半价，按钮上划掉原价 */
  fromRandom: boolean;
  busy: boolean;
  useableSeasonPoint: number;
  useableMemberPoint: number;
  onClose: () => void;
  onConfirm: (useMemberPoint: boolean) => void;
}

/**
 * 详情与付费合一。看清楚买的是什么、再选用哪种积分付，本来就是一件事。
 * 付费按钮的位置不随技能说明长短变，理由见 docs/web/ability-tooltip.md。
 */
export default function AwakenDialog({
  hero,
  unlocked,
  fromRandom,
  busy,
  useableSeasonPoint,
  useableMemberPoint,
  onClose,
  onConfirm,
}: AwakenDialogProps) {
  const t = useTranslations('awaken.dialog');
  const locale = abilityLocale(useLocale());

  const seasonCost = fromRandom ? AWAKEN_RANDOM_SEASON_POINT_COST : AWAKEN_SEASON_POINT_COST;
  const memberCost = fromRandom ? AWAKEN_RANDOM_MEMBER_POINT_COST : AWAKEN_MEMBER_POINT_COST;
  const seasonShort = seasonCost - useableSeasonPoint;
  const memberShort = memberCost - useableMemberPoint;

  return (
    <AbilityDialog
      openKey={hero?.heroName ?? null}
      onClose={onClose}
      busy={busy}
      header={
        hero ? (
          <>
            {hero.icon ? (
              <img
                src={awakenAssetPath(hero.icon)}
                alt=""
                width={96}
                height={96}
                draggable={false}
                className="size-16 shrink-0 rounded-md border border-heading/20"
              />
            ) : null}
            <div className="min-w-0">
              <div className="text-sm text-muted">{hero.name[locale]}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <h2 className="text-lg leading-snug font-bold">
                  <GameText text={hero.title[locale]} />
                </h2>
                {/* 状态跟着技能名一起被看到；底部状态条在付费按钮的位置，两处各管一件事 */}
                {unlocked ? (
                  <span className="inline-flex h-5.5 items-center gap-1 rounded border border-member-border bg-member-soft px-2 text-xs font-bold whitespace-nowrap text-member-strong">
                    <Check className="size-3" aria-hidden="true" />
                    {t('alreadyUnlocked')}
                  </span>
                ) : null}
              </div>
            </div>
          </>
        ) : null
      }
      body={
        hero ? (
          <AbilityDetails
            ability={hero.ability}
            desc={hero.desc[locale]}
            locale={locale}
            variant="dialog"
          />
        ) : null
      }
      footer={
        hero ? (
          <>
            {unlocked ? (
              <p className="flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-member-soft text-sm font-bold text-member-strong lg:min-h-10">
                <Check className="size-4" aria-hidden="true" />
                {t('alreadyUnlocked')}
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                <p className="text-sm">{t('question')}</p>
                <button
                  type="button"
                  disabled={busy || seasonShort > 0}
                  onClick={() => onConfirm(false)}
                  className="btn-season w-full"
                >
                  {/* 读屏只读实际价格，划掉的原价是给眼睛看的 */}
                  {fromRandom ? (
                    <s aria-hidden="true" className="font-semibold opacity-60">
                      {AWAKEN_SEASON_POINT_COST}
                    </s>
                  ) : null}
                  {t('useBattle', { cost: seasonCost })}
                </button>
                {seasonShort > 0 ? (
                  <p className="text-sm text-muted">
                    {t('battleShort', {
                      have: useableSeasonPoint.toLocaleString(),
                      need: seasonShort.toLocaleString(),
                    })}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={busy || memberShort > 0}
                  onClick={() => onConfirm(true)}
                  className="btn-member w-full"
                >
                  {fromRandom ? (
                    <s aria-hidden="true" className="font-semibold opacity-60">
                      {AWAKEN_MEMBER_POINT_COST}
                    </s>
                  ) : null}
                  {t('useMember', { cost: memberCost })}
                </button>
                {memberShort > 0 ? (
                  <p className="text-sm text-muted">
                    {t('memberShort', {
                      have: useableMemberPoint.toLocaleString(),
                      need: memberShort.toLocaleString(),
                    })}
                  </p>
                ) : null}
              </div>
            )}
          </>
        ) : null
      }
    />
  );
}
