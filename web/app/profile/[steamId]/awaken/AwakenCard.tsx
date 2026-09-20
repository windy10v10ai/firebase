'use client';

/* eslint-disable @next/next/no-img-element -- 觉醒的立绘与图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU；理由见 docs/design/web/phase-3b-awaken-page.md */

import { useLocale, useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, useState } from 'react';

import AbilityDetails from '@/app/components/AbilityDetails';
import GameText from '@/app/components/GameText';
import { awakenAssetPath } from '@/app/lib/awaken';

import { useBadgeWrap } from './use-badge-wrap';

import type { AwakenHero } from '@/config/awaken';

const BADGE_CLASS =
  'rounded border border-success bg-black/60 px-1.5 text-[11px] font-bold text-success';
/* 左边配平用的空位不参与压缩：挤不下时整行换成两行，压它会让名字跟着缩出省略号 */
const BADGE_SPACER_CLASS = `${BADGE_CLASS} invisible shrink-0`;

/** 与 w-85 一致 */
const TOOLTIP_WIDTH = 340;
const TOOLTIP_GAP = 10;
const VIEWPORT_MARGIN = 8;
// 悬浮提示靠鼠标才成立，平板和手机按触控处理，与 lg: 断点同一口径
const HOVER_QUERY = '(min-width: 1024px) and (hover: hover)';

interface AwakenCardProps {
  hero: AwakenHero;
  /** 数据没到时为 null */
  unlocked: boolean | null;
  /** 两种积分都不够 */
  tooPoor: boolean;
  /** 已有请求在飞，全部卡片一起禁用 */
  busy: boolean;
  onOpen: (hero: AwakenHero) => void;
}

/**
 * 觉醒卡：结构照搬游戏——立绘铺满作背景、上下各一层压暗渐变、英雄名压在顶部、
 * 技能图标与按钮在底部。卡面不写技能名：电脑档悬停弹出技能提示框，触屏点开详情弹窗。
 *
 * 整张卡是点击热区，里面那个按钮只是视觉提示：游戏内的按钮只有 22px 高，
 * 触屏按不准，用整张卡当热区就不必为了凑触控尺寸把卡片撑大。
 */
export default function AwakenCard({ hero, unlocked, tooPoor, busy, onOpen }: AwakenCardProps) {
  const t = useTranslations('awaken');
  const locale = useLocale() === 'zh' ? 'zh' : 'en';
  // 立绘、英雄名、技能图标都是本地常量，数据没到照样画；这时按钮按未觉醒的样子置灰锁住
  const known = unlocked !== null;
  const dimmed = !unlocked && (tooPoor || busy);
  const { rowRef, nameRef, badgeRef, wrap } = useBadgeWrap<HTMLDivElement>(hero.freeTrial);

  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipSide, setTipSide] = useState<'left' | 'right' | null>(null);

  const showTip = () => {
    const root = rootRef.current;
    if (!root || !window.matchMedia(HOVER_QUERY).matches) {
      return;
    }
    const room = window.innerWidth - root.getBoundingClientRect().right - TOOLTIP_GAP;
    setTipSide(room - VIEWPORT_MARGIN >= TOOLTIP_WIDTH ? 'right' : 'left');
  };

  // 高度要渲染出来才量得到：底边出屏就整体上移，箭头反向补偿，仍对着卡片上部
  useLayoutEffect(() => {
    const root = rootRef.current;
    const tip = tipRef.current;
    if (!tipSide || !root || !tip) {
      return;
    }
    const cardTop = root.getBoundingClientRect().top;
    const overflow = cardTop + tip.offsetHeight + VIEWPORT_MARGIN - window.innerHeight;
    const shift = Math.max(Math.min(0, -overflow), VIEWPORT_MARGIN - cardTop);
    tip.style.setProperty('--tip-shift', `${shift}px`);
  }, [tipSide]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') {
          showTip();
        }
      }}
      onPointerLeave={() => setTipSide(null)}
    >
      <button
        type="button"
        onClick={() => onOpen(hero)}
        onFocus={showTip}
        onBlur={() => setTipSide(null)}
        disabled={!known}
        aria-label={hero.name[locale]}
        className={`relative block aspect-[145/190] w-full overflow-hidden rounded-[10px] border text-left transition-colors ${
          unlocked
            ? 'border-member-strong shadow-[0_0_0_1px_rgba(218,165,32,0.35),0_0_14px_rgba(218,165,32,0.3)]'
            : 'border-season-border hover:border-season'
        }`}
      >
        <img
          src={awakenAssetPath(hero.art)}
          alt=""
          width={290}
          height={380}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 size-full object-cover ${
            dimmed && tooPoor ? 'brightness-[0.62] saturate-[0.55]' : ''
          }`}
        />
        <div
          className={`absolute inset-x-0 top-0 bg-linear-to-b from-surface/80 to-transparent ${
            wrap ? 'h-14' : 'h-10'
          }`}
        />
        {/*
         * 照 game：英雄名落在卡片正中，限免角标压在右上角，角标右边占多宽、左边就空多宽。
         * 名字加两侧角标放不下时名字独占第一行，角标退到第二行右侧，顶部压暗跟着加深，名字不截断。
         * 角标的位置一直占着——限免是常量、已不已觉醒要等接口，数据到了才插进去会让名字动一次。
         */}
        <div
          ref={rowRef}
          className={`absolute inset-x-1.5 top-1.5 flex ${
            wrap ? 'flex-col items-center gap-0.5' : 'items-center justify-center gap-1'
          }`}
        >
          {hero.freeTrial && !wrap ? (
            // 装同样的文案才拿得到同样的宽度，角标换了语言也不用改这里
            <span aria-hidden="true" className={BADGE_SPACER_CLASS}>
              {t('freeTrial')}
            </span>
          ) : null}
          <span
            ref={nameRef}
            className="max-w-full min-w-0 truncate text-[13px] font-bold text-heading [text-shadow:0_2px_4px_rgba(0,0,0,0.95)]"
          >
            {hero.name[locale]}
          </span>
          {hero.freeTrial ? (
            <span
              ref={badgeRef}
              className={`${BADGE_CLASS} shrink-0 ${wrap ? 'self-end' : ''} ${
                unlocked === false ? '' : 'invisible'
              }`}
            >
              {t('freeTrial')}
            </span>
          ) : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 h-26 bg-linear-to-b from-transparent via-surface/95 to-surface/98" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 px-2.5 pb-2.5">
          {hero.icon ? (
            <img
              src={awakenAssetPath(hero.icon)}
              alt=""
              width={96}
              height={96}
              loading="lazy"
              decoding="async"
              className="size-11.5 rounded-[5px] border border-heading/20 shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
            />
          ) : (
            <span className="flex size-11.5 items-center justify-center rounded-[5px] border border-dashed border-heading/35 bg-black/45 text-[10px] text-muted">
              {t('iconMissing')}
            </span>
          )}
          <span
            className={`flex h-7.5 w-full items-center justify-center rounded-[7px] border text-[13px] font-bold ${
              unlocked
                ? 'border-transparent bg-member-soft text-member-strong'
                : dimmed || !known
                  ? 'border-line bg-panel-soft/90 text-faint'
                  : 'border-[#7a6fd0] bg-linear-to-r from-[#4f48b2] to-[#0f033a] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.53)]'
            }`}
          >
            {unlocked ? t('unlocked') : t('unlock')}
          </span>
        </div>
      </button>

      {tipSide ? (
        // 只是鼠标用户的快捷预览，读屏用户点开详情弹窗拿到的是同一份内容
        <div
          ref={tipRef}
          aria-hidden="true"
          className={`pointer-events-none absolute top-(--tip-shift) z-30 w-85 rounded-lg border border-line-strong bg-panel-soft text-content shadow-[0_18px_40px_-10px_rgba(0,0,0,0.85)] ${
            tipSide === 'right' ? 'left-[calc(100%+10px)]' : 'right-[calc(100%+10px)]'
          }`}
        >
          <span
            className={`absolute top-[calc(20px-var(--tip-shift))] size-2.75 rotate-45 border-line-strong bg-panel-raised ${
              tipSide === 'right' ? '-left-1.5 border-b border-l' : '-right-1.5 border-t border-r'
            }`}
          />
          <div className="flex items-center gap-3 rounded-t-lg border-b border-line bg-panel-raised px-3.5 py-3">
            {hero.icon ? (
              <img
                src={awakenAssetPath(hero.icon)}
                alt=""
                width={96}
                height={96}
                className="size-11 shrink-0 rounded-[5px] border border-heading/20"
              />
            ) : null}
            <div className="flex min-w-0 flex-col gap-px">
              <div className="text-base leading-5.5 font-bold text-heading">
                <GameText text={hero.title[locale]} />
              </div>
              <div className="text-xs leading-4.5 text-muted">{hero.name[locale]}</div>
            </div>
          </div>
          <div className="flex flex-col gap-3 px-3.5 pt-3 pb-3.5">
            <AbilityDetails
              ability={hero.ability}
              desc={hero.desc[locale]}
              locale={locale}
              variant="tooltip"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
