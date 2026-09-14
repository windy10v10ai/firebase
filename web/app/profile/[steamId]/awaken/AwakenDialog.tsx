'use client';

/* eslint-disable @next/next/no-img-element -- 觉醒的立绘与图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU；理由见 docs/design/web/phase-3b-awaken-page.md */

import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import GameText from '@/app/components/GameText';
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
  /** 从随机候选进来的走半价，文案也不同 */
  fromRandom: boolean;
  busy: boolean;
  useableSeasonPoint: number;
  useableMemberPoint: number;
  onClose: () => void;
  onConfirm: (useMemberPoint: boolean) => void;
}

/**
 * 详情与付费合一。看清楚买的是什么、再选用哪种积分付，本来就是一件事。
 * 用原生 <dialog> 白拿焦点陷阱和 Esc 关闭，和属性页的重置弹窗同一套。
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
  const locale = useLocale() === 'zh' ? 'zh' : 'en';
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (hero && !dialog.open) {
      dialog.showModal();
    } else if (!hero && dialog.open) {
      dialog.close();
    }
  }, [hero]);

  const seasonCost = fromRandom ? AWAKEN_RANDOM_SEASON_POINT_COST : AWAKEN_SEASON_POINT_COST;
  const memberCost = fromRandom ? AWAKEN_RANDOM_MEMBER_POINT_COST : AWAKEN_MEMBER_POINT_COST;
  const seasonShort = seasonCost - useableSeasonPoint;
  const memberShort = memberCost - useableMemberPoint;

  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(event) => {
        // 点遮罩关闭：事件落在 dialog 本身而不是里面的内容时才算点在遮罩上
        if (event.target === ref.current) {
          onClose();
        }
      }}
      className="card-container m-auto w-[min(28rem,calc(100vw-2rem))] p-0 text-content backdrop:bg-black/60"
    >
      {hero ? (
        <div className="card-pad flex flex-col gap-4.5">
          <div className="flex items-start gap-4">
            {hero.icon ? (
              <img
                src={awakenAssetPath(hero.icon)}
                alt=""
                width={96}
                height={96}
                className="size-16 shrink-0 rounded-md border border-heading/20"
              />
            ) : null}
            <div className="min-w-0">
              <div className="text-sm text-muted">{hero.name[locale]}</div>
              <h2 className="mt-0.5 text-lg leading-snug font-bold">
                <GameText text={hero.title[locale]} />
              </h2>
            </div>
          </div>

          <p className="leading-relaxed">
            <GameText text={hero.desc[locale]} />
          </p>

          {unlocked ? (
            <p className="flex items-center gap-2 rounded-[7px] border border-member-border bg-member-soft px-3.5 py-2.5 text-sm font-bold text-member-strong">
              <Check className="size-4.5" aria-hidden="true" />
              {t('alreadyUnlocked')}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {fromRandom ? <p className="text-sm text-member">{t('halfPrice')}</p> : null}
              <p className="text-sm">{t('question')}</p>
              <button
                type="button"
                disabled={busy || seasonShort > 0}
                onClick={() => onConfirm(false)}
                className="btn-season w-full"
              >
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
              <p className="text-sm text-muted">{t('permanent')}</p>
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 rounded-[7px] border border-line bg-control text-sm text-content transition-colors hover:bg-control-hover"
          >
            {t('close')}
          </button>
        </div>
      ) : null}
    </dialog>
  );
}
