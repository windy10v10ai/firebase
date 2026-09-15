'use client';

/* eslint-disable @next/next/no-img-element -- 觉醒的立绘与图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU；理由见 docs/design/web/phase-3b-awaken-page.md */

import { useTranslations } from 'next-intl';

import { awakenAssetPath } from '@/app/lib/awaken';

import type { AwakenHero } from '@/config/awaken';

interface RandomCardProps {
  /** 卡面拼贴的三张立绘，取最新上线的 3 个觉醒 */
  preview: AwakenHero[];
  enabled: boolean;
  /** 剩余可觉醒不足 3 个 */
  poolShort: boolean;
  onClick: () => void;
}

const DISCOUNT_CLASS =
  'rounded border border-discount bg-black/60 px-1.5 text-[11px] font-bold text-discount';
/* 与英雄卡的限免标签同一套居中法：左边放一个等宽的隐形占位，标题才落在正中 */
const DISCOUNT_SPACER_CLASS = `${DISCOUNT_CLASS} invisible min-w-0 overflow-hidden [flex-shrink:999]`;

/**
 * 随机抽选入口：固定在网格首位，金色描边照游戏的做法与英雄卡区分。
 * 底是压暗的立绘拼贴，和英雄卡同一种立绘铺底；折扣写成标题旁的标签，和英雄卡的限免标签同一种写法。
 */
export default function RandomCard({ preview, enabled, poolShort, onClick }: RandomCardProps) {
  const t = useTranslations('awaken.random');

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      title={poolShort ? t('poolShort') : undefined}
      className={`relative aspect-[145/190] w-full overflow-hidden rounded-[10px] border border-member-border bg-panel text-left transition-colors ${
        enabled ? 'hover:border-member-strong' : 'opacity-60'
      }`}
    >
      <span aria-hidden="true" className="absolute inset-0 grid grid-cols-3 gap-0.5">
        {preview.map((hero) => (
          <img
            key={hero.heroName}
            src={awakenAssetPath(hero.art)}
            alt=""
            width={290}
            height={380}
            loading="lazy"
            decoding="async"
            className="size-full object-cover brightness-42 grayscale-85"
          />
        ))}
      </span>
      <span className="absolute inset-x-0 top-0 h-18 bg-linear-to-b from-surface/90 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent via-surface/95 to-surface/98" />

      <span className="absolute inset-x-1.5 top-1.5 flex items-center justify-center gap-1">
        <span aria-hidden="true" className={DISCOUNT_SPACER_CLASS}>
          {t('discount')}
        </span>
        <span className="min-w-0 truncate text-[13px] font-bold text-member [text-shadow:0_2px_4px_rgba(0,0,0,0.9)]">
          {t('title')}
        </span>
        <span className={`${DISCOUNT_CLASS} shrink-0`}>{t('discount')}</span>
      </span>
      <span className="absolute inset-x-2.5 top-11 text-center text-[11px] leading-relaxed text-member/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        {t('threePick')}
      </span>
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[-58%] text-[44px] leading-none font-extrabold text-[#f5e6c8] [text-shadow:0_2px_6px_#000]"
      >
        ?
      </span>

      <span className="absolute inset-x-0 bottom-0 flex flex-col items-center px-2.5 pb-2.5">
        <span
          className={`flex h-7.5 w-full items-center justify-center rounded-[7px] border text-[13px] font-bold ${
            enabled
              ? 'border-[#7a6fd0] bg-linear-to-r from-[#4f48b2] to-[#0f033a] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.53)]'
              : 'border-line bg-panel-soft/90 text-faint'
          }`}
        >
          {t('draw')}
        </span>
      </span>
    </button>
  );
}
