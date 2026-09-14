'use client';

/* eslint-disable @next/next/no-img-element -- 觉醒的立绘与图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU；理由见 docs/design/web/phase-3b-awaken-page.md */

import { useLocale, useTranslations } from 'next-intl';

import GameText from '@/app/components/GameText';
import { awakenAssetPath } from '@/app/lib/awaken';

import type { AwakenHero } from '@/config/awaken';

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
 * 技能图标与按钮在底部。卡面不写技能名，技能名在详情弹窗里。
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

  return (
    <button
      type="button"
      onClick={() => onOpen(hero)}
      disabled={!known}
      aria-label={hero.name[locale]}
      className={`group relative aspect-[145/190] w-full overflow-hidden rounded-[10px] border text-left transition-colors ${
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
      <div className="absolute inset-x-0 top-0 h-10 bg-linear-to-b from-surface/80 to-transparent" />
      {/* 角标与英雄名同排：压在名字上的话，卡片一窄，截断后的名字末尾就被角标盖住 */}
      <div className="absolute inset-x-1.5 top-1.5 flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-center text-[13px] font-bold text-heading [text-shadow:0_2px_4px_rgba(0,0,0,0.95)]">
          {hero.name[locale]}
        </span>
        {/* 限免是常量、已不已觉醒要等接口，角标的位置因此一直占着：数据到了才插进去会把名字挤窄一次 */}
        {hero.freeTrial ? (
          <span
            className={`shrink-0 rounded border border-success bg-black/60 px-1.5 text-[11px] font-bold text-success ${
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
                ? 'border-line bg-panel-soft/90 text-[#5d5d66]'
                : 'border-[#7a6fd0] bg-linear-to-r from-[#4f48b2] to-[#0f033a] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.53)]'
          }`}
        >
          {unlocked ? t('unlocked') : t('unlock')}
        </span>
      </div>

      {/* 桌面端补一层悬停提示：卡面没有技能名，鼠标用户不必点开才知道是什么技能 */}
      <span className="pointer-events-none absolute inset-x-0 top-9 hidden px-2 text-center text-[11px] leading-snug text-heading opacity-0 transition-opacity [text-shadow:0_1px_4px_rgba(0,0,0,0.95)] group-hover:opacity-100 md:block">
        <GameText text={hero.title[locale]} />
      </span>
    </button>
  );
}
