'use client';

/* eslint-disable @next/next/no-img-element -- 图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU；理由同 docs/design/web/phase-3b-awaken-page.md */

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useEffect, useState } from 'react';

import AbilityDetails from '@/app/components/AbilityDetails';
import AbilityDialog from '@/app/components/AbilityDialog';
import AbilityHoverTip from '@/app/components/AbilityHoverTip';
import Input from '@/app/components/ui/input';
import Skeleton from '@/app/components/ui/skeleton';
import { pickText } from '@/app/lib/ability-text';

import { DETAIL_LOADERS, type WikiDetail } from './details';
import WikiTabs from './WikiTabs';

import type { AbilityLocale } from '@/app/lib/ability-text';

/** 页面上一格要画的东西，名字已按当前语言取好；说明另行加载，见 details.ts */
export interface WikiEntry {
  key: string;
  /** 分区；物品不分区时全部同一个值 */
  group: string;
  tier: number;
  label: string;
  /** 提示框标题下那一行，如「主动 · T4」 */
  tag: string;
  icon: string | null;
  /** 三语名字合在一起的小写串，搜索用 */
  search: string;
}

interface WikiGridProps {
  kind: 'abilities' | 'items';
  /** title 为 null 时不画分区标题 */
  groups: { key: string; title: string | null }[];
  entries: WikiEntry[];
  locale: AbilityLocale;
}

// 描边与档位标签照游戏抽选界面的五档色；类名写全，Tailwind 才扫得到
const TIER_CLASS: Record<number, { border: string; badge: string; text: string }> = {
  5: { border: 'border-tier-5', badge: 'bg-tier-5/15 text-tier-5-text', text: 'text-tier-5-text' },
  4: { border: 'border-tier-4', badge: 'bg-tier-4/12 text-tier-4-text', text: 'text-tier-4-text' },
  3: { border: 'border-tier-3', badge: 'bg-tier-3/20 text-tier-3-text', text: 'text-tier-3-text' },
  2: { border: 'border-tier-2', badge: 'bg-tier-2/15 text-tier-2-text', text: 'text-tier-2-text' },
  1: { border: 'border-tier-1', badge: 'bg-tier-1/10 text-tier-1-text', text: 'text-tier-1-text' },
};

// 物品图是 88×64 的横图，技能图是方图；格子宽度一样，只有图标的形状不同
const ICON_CLASS = {
  abilities: { cell: 'size-14 lg:size-16', tip: 'size-11', dialog: 'size-16' },
  items: { cell: 'h-10.5 w-14.5 lg:h-12 lg:w-16.5', tip: 'h-8 w-11', dialog: 'h-11.5 w-16' },
};

/**
 * 图鉴页的主体：搜索框、按分区与档位排开的图标墙、电脑档悬浮提示与点开的详情弹窗。
 * 档位从高到低排，同档内保持 game 抽选池里的顺序。
 */
export default function WikiGrid({ kind, groups, entries, locale }: WikiGridProps) {
  const t = useTranslations('wiki');
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const opened = entries.find((entry) => entry.key === openKey) ?? null;
  const [details, setDetails] = useState<Map<string, WikiDetail> | null>(null);

  // 格子出来后马上在后台取说明，等到悬停时多半已经到了
  useEffect(() => {
    let alive = true;
    DETAIL_LOADERS[kind]().then((loaded) => {
      if (alive) {
        setDetails(loaded);
      }
    });
    return () => {
      alive = false;
    };
  }, [kind]);

  const visible = deferred ? entries.filter((entry) => entry.search.includes(deferred)) : entries;
  const sections = groups
    .map((group) => {
      const inGroup = visible.filter((entry) => entry.group === group.key);
      const tiers = [...new Set(inGroup.map((entry) => entry.tier))]
        .sort((a, b) => b - a)
        .map((tier) => ({ tier, items: inGroup.filter((entry) => entry.tier === tier) }));
      return { ...group, tiers };
    })
    .filter((section) => section.tiers.length > 0);

  const icon = (entry: WikiEntry, size: string) =>
    entry.icon ? (
      <img
        src={entry.icon}
        alt=""
        width={kind === 'items' ? 88 : 128}
        height={kind === 'items' ? 64 : 128}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={`${size} shrink-0 rounded-md border-2 object-cover ${TIER_CLASS[entry.tier].border}`}
      />
    ) : (
      <span
        className={`${size} flex shrink-0 items-center justify-center rounded-md border-2 border-dashed bg-panel-soft text-[10px] text-muted ${TIER_CLASS[entry.tier].border}`}
      >
        {t('iconMissing')}
      </span>
    );

  const detailBlock = (entry: WikiEntry, variant: 'tooltip' | 'dialog') => {
    const detail = details?.get(entry.key);
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
  };

  return (
    <>
      {/* tab 与搜索框两页都有，放在同一行，切换页面时位置不动；分区跳转只有技能页有，放到下一行 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <WikiTabs
          tabs={[
            { href: '/wiki/abilities', label: t('tabs.abilities') },
            { href: '/wiki/items', label: t('tabs.items') },
          ]}
        />
        <div className="md:w-72">
          <Input
            type="search"
            icon={<Search className="size-4" />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(`search.${kind}`)}
            aria-label={t(`search.${kind}`)}
          />
        </div>
      </div>

      {groups.length > 1 ? (
        <nav className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <a
              key={group.key}
              href={`#${group.key}`}
              className="flex min-h-9 items-center rounded-full border border-line-strong px-3.5 text-sm text-content transition-colors hover:border-link hover:text-heading"
            >
              {group.title}
            </a>
          ))}
        </nav>
      ) : null}

      {sections.length === 0 ? (
        <p className="py-12 text-center text-muted">{t('empty', { query: query.trim() })}</p>
      ) : null}

      {sections.map((section) => (
        <section
          key={section.key}
          id={section.key}
          className="flex scroll-mt-20 flex-col gap-3 md:gap-4"
        >
          {section.title ? (
            <h2 className="text-lg font-bold text-heading">{section.title}</h2>
          ) : null}
          {section.tiers.map(({ tier, items }) => (
            <div key={tier} className="card-container card-pad-sm flex flex-col gap-3">
              <span
                className={`inline-flex h-6 min-w-9 items-center justify-center self-start rounded-md px-2 text-[13px] font-bold ${TIER_CLASS[tier].badge}`}
              >
                T{tier}
              </span>
              <ul className="grid grid-cols-4 gap-x-1.5 gap-y-3.5 md:grid-cols-8 lg:grid-cols-12 lg:gap-x-2 lg:gap-y-4">
                {items.map((entry) => (
                  <li key={entry.key} className="min-w-0">
                    <AbilityHoverTip
                      icon={icon(entry, ICON_CLASS[kind].tip)}
                      title={entry.label}
                      subtitle={
                        <span className={`font-semibold ${TIER_CLASS[entry.tier].text}`}>
                          {entry.tag}
                        </span>
                      }
                      content={detailBlock(entry, 'tooltip')}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenKey(entry.key)}
                        className="group flex w-full flex-col items-center gap-1.5 rounded-md py-1 text-center"
                      >
                        <span className="rounded-md transition-[filter] group-hover:brightness-125">
                          {icon(entry, ICON_CLASS[kind].cell)}
                        </span>
                        <span className="line-clamp-2 text-xs leading-4 text-content group-hover:text-heading">
                          {entry.label}
                        </span>
                      </button>
                    </AbilityHoverTip>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <AbilityDialog
        openKey={openKey}
        onClose={() => setOpenKey(null)}
        header={
          opened ? (
            <>
              {icon(opened, ICON_CLASS[kind].dialog)}
              <div className="min-w-0">
                <h2 className="text-lg leading-snug font-bold text-heading">{opened.label}</h2>
                <div className={`mt-0.5 text-sm font-semibold ${TIER_CLASS[opened.tier].text}`}>
                  {opened.tag}
                </div>
              </div>
            </>
          ) : null
        }
        body={opened ? detailBlock(opened, 'dialog') : null}
      />
    </>
  );
}
