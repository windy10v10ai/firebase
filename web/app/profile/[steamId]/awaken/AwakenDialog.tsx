'use client';

/* eslint-disable @next/next/no-img-element -- 觉醒的立绘与图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU；理由见 docs/design/web/phase-3b-awaken-page.md */

import { Check, ChevronDown, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, useState } from 'react';

import AbilityDetails from '@/app/components/AbilityDetails';
import GameText from '@/app/components/GameText';
import {
  AWAKEN_MEMBER_POINT_COST,
  AWAKEN_RANDOM_MEMBER_POINT_COST,
  AWAKEN_RANDOM_SEASON_POINT_COST,
  AWAKEN_SEASON_POINT_COST,
  awakenAssetPath,
} from '@/app/lib/awaken';

import type { AwakenHero } from '@/config/awaken';

// 展开时按渐隐高度回退滚动距离，接着被盖住的那几行往下读，不从已经看过的地方重来
const FADE_HEIGHT = 48;

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
 * 用原生 <dialog> 白拿焦点陷阱和 Esc 关闭，和属性页的重置弹窗同一套。
 * 付费按钮的位置不随技能说明长短变，说明放不下时先收起，点「详细」再滚动；理由见 docs/web/ability-tooltip.md。
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  // 记的是展开了哪个英雄，换英雄时自然回到收起，不用另写重置
  const [expandedHero, setExpandedHero] = useState<string | null>(null);
  const expanded = hero !== null && expandedHero === hero.heroName;
  const collapsed = overflowing && !expanded;

  // 先打开再量高度，两步都在绘制前完成，收起态第一帧就是对的
  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!body || !content) {
      return;
    }
    const measure = () => setOverflowing(content.offsetHeight > body.clientHeight + 1);
    measure();
    // 窗口高度、字体加载都会改变放不放得下
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    observer.observe(content);
    return () => observer.disconnect();
  }, [hero]);

  const expand = () => {
    const body = bodyRef.current;
    if (!hero || !body) {
      return;
    }
    const top = Math.max(0, body.clientHeight - FADE_HEIGHT * 2);
    setExpandedHero(hero.heroName);
    // 「详细」按钮点完就消失，焦点交给说明区，键盘用户可以接着用方向键滚
    body.focus({ preventScroll: true });
    body.scrollTo({
      top,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

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
      // 手机是贴底的抽屉，按钮落在拇指区；平板起居中且统一高度，换英雄时按钮不挪位置
      className="card-container m-0 mt-auto max-h-[calc(100dvh-3rem)] w-full max-w-none rounded-t-[14px] rounded-b-none border-b-0 p-0 text-content transition-[translate] duration-200 ease-out backdrop:bg-black/60 open:flex open:flex-col starting:open:translate-y-full md:m-auto md:h-[min(40rem,calc(100dvh-4rem))] md:max-h-none md:w-[min(28rem,calc(100vw-2rem))] md:rounded-[10px] md:border-b md:transition-none md:starting:open:translate-y-0"
    >
      {hero ? (
        <div className="card-pad flex min-h-0 flex-1 flex-col gap-4.5">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label={t('close')}
            className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-[7px] text-muted transition-colors hover:bg-panel-soft hover:text-heading md:top-3 md:right-3 lg:top-4 lg:right-4 lg:size-9"
          >
            <X className="size-5" aria-hidden="true" />
          </button>

          <div className="flex items-start gap-4 pe-9 lg:pe-6">
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
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              ref={bodyRef}
              tabIndex={-1}
              className={`min-h-0 flex-1 outline-none ${
                expanded ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'
              }`}
            >
              <div ref={contentRef} className="flex flex-col gap-4.5">
                <AbilityDetails
                  ability={hero.ability}
                  desc={hero.desc[locale]}
                  locale={locale}
                  variant="dialog"
                />
              </div>
            </div>
            {collapsed ? (
              <div
                aria-hidden="true"
                style={{ height: FADE_HEIGHT }}
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-b from-transparent to-panel"
              />
            ) : null}
          </div>

          {collapsed ? (
            <button
              type="button"
              onClick={expand}
              className="link-inline -mt-2.5 inline-flex min-h-8 items-center gap-1 self-start text-sm font-bold"
            >
              {t('more')}
              <ChevronDown className="size-4" aria-hidden="true" />
            </button>
          ) : null}

          <hr className="border-line" />

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
        </div>
      ) : null}
    </dialog>
  );
}
