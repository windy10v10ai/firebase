'use client';

/* eslint-disable @next/next/no-img-element -- 觉醒的立绘与图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU；理由见 docs/design/web/phase-3b-awaken-page.md */

import { useTranslations } from 'next-intl';

import { awakenAssetPath } from '@/app/lib/awaken';

import type { AwakenHero } from '@/config/awaken';

interface RandomCardProps {
  /** 卡面上扇形叠放的三张立绘，取最新上线的 3 个觉醒 */
  preview: AwakenHero[];
  enabled: boolean;
  /** 剩余可觉醒不足 3 个 */
  poolShort: boolean;
  onClick: () => void;
}

// 扇形的三张：中间一张正放，两侧各转一点、左右错开
const FAN = [
  { rotate: -14, shift: -26 },
  { rotate: 14, shift: 26 },
  { rotate: 0, shift: 0 },
];

/** 随机抽选入口：固定在网格首位，金色描边配紫色渐变底，与英雄卡区分——照游戏的做法 */
export default function RandomCard({ preview, enabled, poolShort, onClick }: RandomCardProps) {
  const t = useTranslations('awaken.random');
  // 中间那张要压在两侧之上，所以正放的排最后
  const fanned = [preview[1], preview[2], preview[0]].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      title={poolShort ? t('poolShort') : undefined}
      className={`relative aspect-[145/190] w-full overflow-hidden rounded-[10px] border border-member-border bg-linear-to-b from-[#3a2b66] to-[#1a0836] text-left transition-colors ${
        enabled ? 'hover:border-member-strong' : 'opacity-60'
      }`}
    >
      <div className="absolute inset-x-1.5 top-1.5 truncate text-center text-[13px] font-bold text-member">
        {t('title')}
      </div>
      <div className="absolute inset-x-2.5 top-11 text-center text-[11px] leading-relaxed text-member/85">
        {t('halfPrice')}
        <br />
        {t('threePick')}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 px-2.5 pb-2.5">
        <span className="relative block h-14.5 w-24">
          {fanned.map((hero, index) => {
            const { rotate, shift } = FAN[index];
            return (
              <img
                key={hero.heroName}
                src={awakenAssetPath(hero.art)}
                alt=""
                width={290}
                height={380}
                loading="lazy"
                decoding="async"
                className="absolute top-0 left-1/2 h-13 w-10 rounded-[5px] border border-member/45 object-cover grayscale-[1] brightness-80"
                style={{ transform: `translateX(calc(-50% + ${shift}px)) rotate(${rotate}deg)` }}
              />
            );
          })}
          <span className="absolute top-3.5 left-1/2 -translate-x-1/2 text-[22px] font-extrabold text-[#f5e6c8] [text-shadow:0_2px_6px_#000]">
            ?
          </span>
        </span>
        <span
          className={`flex h-7.5 w-full items-center justify-center rounded-[7px] border text-[13px] font-bold ${
            enabled
              ? 'border-[#7a6fd0] bg-linear-to-r from-[#4f48b2] to-[#0f033a] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.53)]'
              : 'border-line bg-panel-soft/90 text-[#5d5d66]'
          }`}
        >
          {t('draw')}
        </span>
      </div>
    </button>
  );
}
