'use client';

/* eslint-disable @next/next/no-img-element -- 图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU */

import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';

import AbilityDetails from '@/app/components/AbilityDetails';
import AbilityDialog from '@/app/components/AbilityDialog';
import AbilityHoverTip from '@/app/components/AbilityHoverTip';
import Skeleton from '@/app/components/ui/skeleton';
import { pickText, type AbilityLocale } from '@/app/lib/ability-text';

import type { WikiEntry } from '@/app/wiki/entries';
import type { WikiDetail } from '@/config/wiki';

export type WikiKind = 'abilities' | 'items';

// 描边与档位标签照游戏抽选界面的五档色；类名写全，Tailwind 才扫得到
export const TIER_CLASS: Record<number, { border: string; badge: string; text: string }> = {
  5: { border: 'border-tier-5', badge: 'bg-tier-5/15 text-tier-5-text', text: 'text-tier-5-text' },
  4: { border: 'border-tier-4', badge: 'bg-tier-4/12 text-tier-4-text', text: 'text-tier-4-text' },
  3: { border: 'border-tier-3', badge: 'bg-tier-3/20 text-tier-3-text', text: 'text-tier-3-text' },
  2: { border: 'border-tier-2', badge: 'bg-tier-2/15 text-tier-2-text', text: 'text-tier-2-text' },
  1: { border: 'border-tier-1', badge: 'bg-tier-1/10 text-tier-1-text', text: 'text-tier-1-text' },
};

// 物品图是 88×64 的横图，技能图是方图；格子宽度一样，只有图标的形状不同
export const ICON_CLASS = {
  abilities: { cell: 'size-14 lg:size-16', tip: 'size-11', dialog: 'size-16' },
  items: { cell: 'h-10.5 w-14.5 lg:h-12 lg:w-16.5', tip: 'h-8 w-11', dialog: 'h-11.5 w-16' },
};

type DetailMap = Map<string, WikiDetail>;

/**
 * 说明数据单独成包，不随页面下发；文件名带内容 hash，浏览器长期缓存。
 * 同一页里多处要用时共用一次加载。
 */
const LOADERS: Record<WikiKind, () => Promise<Record<string, WikiDetail>>> = {
  abilities: () =>
    import('@/config/wiki-ability-details.json').then(
      (data) => data.default as unknown as Record<string, WikiDetail>,
    ),
  items: () =>
    import('@/config/wiki-item-details.json').then(
      (data) => data.default as unknown as Record<string, WikiDetail>,
    ),
};
const loading: Partial<Record<WikiKind, Promise<DetailMap>>> = {};

function loadDetails(kind: WikiKind): Promise<DetailMap> {
  loading[kind] ??= LOADERS[kind]().then((data) => new Map(Object.entries(data)));
  return loading[kind];
}

/** enabled 为 false 时不发起加载，返回 null；变成 true 后开始加载，到了再返回 */
export function useWikiDetails(kind: WikiKind, enabled = true): DetailMap | null {
  const [details, setDetails] = useState<DetailMap | null>(null);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let alive = true;
    loadDetails(kind).then((loaded) => {
      if (alive) {
        setDetails(loaded);
      }
    });
    return () => {
      alive = false;
    };
  }, [kind, enabled]);
  return details;
}

export function WikiIcon({
  kind,
  entry,
  size,
}: {
  kind: WikiKind;
  entry: WikiEntry;
  size: keyof (typeof ICON_CLASS)['items'];
}) {
  const t = useTranslations('wiki');
  const sizeClass = ICON_CLASS[kind][size];
  return entry.icon ? (
    <img
      src={entry.icon}
      alt=""
      width={kind === 'items' ? 88 : 128}
      height={kind === 'items' ? 64 : 128}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`${sizeClass} shrink-0 rounded-md border-2 object-cover ${TIER_CLASS[entry.tier].border}`}
    />
  ) : (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-md border-2 border-dashed bg-panel-soft text-[10px] text-muted ${TIER_CLASS[entry.tier].border}`}
    >
      {t('iconMissing')}
    </span>
  );
}

function DetailBlock({
  detail,
  locale,
  variant,
}: {
  detail: WikiDetail | undefined;
  locale: AbilityLocale;
  variant: 'tooltip' | 'dialog';
}) {
  if (!detail) {
    return (
      <p className="text-[13px] leading-[1.65]">
        <Skeleton>0000000000000000000000000000000000000000000000000000000000</Skeleton>
      </p>
    );
  }
  return (
    <AbilityDetails
      ability={detail.ability}
      desc={pickText(detail.desc, locale)}
      locale={locale}
      variant={variant}
    />
  );
}

/** 电脑档的悬浮说明，挂在 children 上；说明没到时先放骨架 */
export function WikiHoverTip({
  kind,
  entry,
  details,
  locale,
  children,
}: {
  kind: WikiKind;
  entry: WikiEntry;
  details: DetailMap | null;
  locale: AbilityLocale;
  children: ReactNode;
}) {
  return (
    <AbilityHoverTip
      icon={<WikiIcon kind={kind} entry={entry} size="tip" />}
      title={entry.label}
      subtitle={<span className={`font-semibold ${TIER_CLASS[entry.tier].text}`}>{entry.tag}</span>}
      content={<DetailBlock detail={details?.get(entry.key)} locale={locale} variant="tooltip" />}
    >
      {children}
    </AbilityHoverTip>
  );
}

/** 点开后的详情弹窗：手机是贴底抽屉，平板起居中；entry 为 null 时关闭 */
export function WikiDialog({
  kind,
  entry,
  details,
  locale,
  onClose,
}: {
  kind: WikiKind;
  entry: WikiEntry | null;
  details: DetailMap | null;
  locale: AbilityLocale;
  onClose: () => void;
}) {
  return (
    <AbilityDialog
      openKey={entry?.key ?? null}
      onClose={onClose}
      header={
        entry ? (
          <>
            <WikiIcon kind={kind} entry={entry} size="dialog" />
            <div className="min-w-0">
              <h2 className="text-lg leading-snug font-bold text-heading">{entry.label}</h2>
              <div className={`mt-0.5 text-sm font-semibold ${TIER_CLASS[entry.tier].text}`}>
                {entry.tag}
              </div>
            </div>
          </>
        ) : null
      }
      body={
        entry ? (
          <DetailBlock detail={details?.get(entry.key)} locale={locale} variant="dialog" />
        ) : null
      }
    />
  );
}
