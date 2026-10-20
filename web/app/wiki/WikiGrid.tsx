'use client';

/* eslint-disable @next/next/no-img-element -- 图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU */

import { ArrowRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';

import Input from '@/app/components/ui/input';
import {
  TIER_CLASS,
  useWikiDetails,
  WikiDialog,
  WikiHoverTip,
  WikiIcon,
  type WikiKind,
} from '@/app/components/WikiDetail';
import { GAME_ICON } from '@/config/game-icons';

import WikiTabs from './WikiTabs';

import type { WikiEntry } from './entries';
import type { AbilityLocale } from '@/app/lib/ability-text';

export interface WikiGroup {
  key: string;
  /** null 时不画分区标题 */
  title: string | null;
  /** 每档卡片左上角的标签；null 表示这一区不分档，整区一张卡 */
  tierLabels: Record<number, string> | null;
  /** 档位标签前带金币图标，商店价格档用 */
  priced?: boolean;
}

/** 物品页的「商店 / 抽奖」各是一类，两类各看各的；技能页只有一类，不出切换 */
export interface WikiCategory {
  key: string;
  label: string;
  groups: WikiGroup[];
  entries: WikiEntry[];
}

interface WikiGridProps {
  kind: WikiKind;
  categories: WikiCategory[];
  locale: AbilityLocale;
}

/**
 * 百科页的主体：搜索框、分类切换、按分区与档位排开的图标墙、电脑档悬浮提示与点开的详情弹窗。
 * 档位从高到低排，同档内保持数据里的顺序。
 */
export default function WikiGrid({ kind, categories, locale }: WikiGridProps) {
  const t = useTranslations('wiki');
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const [categoryKey, setCategoryKey] = useState(categories[0].key);
  const category = categories.find((c) => c.key === categoryKey) ?? categories[0];
  const [openKey, setOpenKey] = useState<string | null>(null);
  const opened = category.entries.find((entry) => entry.key === openKey) ?? null;
  // 格子出来后马上在后台取说明，等到悬停时多半已经到了
  const details = useWikiDetails(kind);

  const matches = (entries: WikiEntry[]) =>
    deferred ? entries.filter((entry) => entry.search.includes(deferred)) : entries;
  const counts = new Map(categories.map((c) => [c.key, matches(c.entries).length]));
  const visible = matches(category.entries);
  const other = categories.find((c) => c.key !== category.key && (counts.get(c.key) ?? 0) > 0);

  const sections = category.groups
    .map((group) => {
      const inGroup = visible.filter((entry) => entry.group === group.key);
      const cards = group.tierLabels
        ? [...new Set(inGroup.map((entry) => entry.tier))]
            .sort((a, b) => b - a)
            .map((tier) => ({ tier, items: inGroup.filter((entry) => entry.tier === tier) }))
        : [{ tier: null, items: inGroup }];
      return { ...group, cards: cards.filter((card) => card.items.length > 0) };
    })
    .filter((section) => section.cards.length > 0);

  const showSwitch = categories.length > 1;
  const showJump = category.groups.length > 1;

  return (
    <>
      {/* tab 与搜索框两页都有，放在同一行，切换页面时位置不动；分类切换与分区跳转放到下一行 */}
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

      {showSwitch || showJump ? (
        <div className="flex flex-wrap items-center gap-3">
          {showSwitch ? (
            <div
              role="group"
              aria-label={t('category.label')}
              className="flex gap-1 rounded-[10px] border border-line bg-panel p-0.75 max-md:w-full"
            >
              {categories.map((c) => {
                const current = c.key === category.key;
                const count = counts.get(c.key) ?? 0;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={current}
                    onClick={() => setCategoryKey(c.key)}
                    className={`flex min-h-11 items-center justify-center gap-1.5 rounded-[7px] px-4 text-sm whitespace-nowrap transition-colors max-md:flex-1 lg:min-h-8.5 ${
                      current
                        ? 'bg-panel-raised font-semibold text-heading'
                        : 'text-content hover:text-heading'
                    }`}
                  >
                    {c.label}
                    {/* 搜索时两边都标出结果数，不用切过去就知道另一类有没有 */}
                    {deferred ? (
                      <span
                        className={`min-w-5 rounded-full px-1.5 text-xs leading-5 font-semibold tabular-nums ${
                          current ? 'bg-line-strong' : 'bg-line'
                        } ${count === 0 ? 'text-muted' : current ? 'text-heading' : 'text-content'}`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {showSwitch && showJump ? (
            <span className="h-5 w-px bg-line max-md:hidden" aria-hidden="true" />
          ) : null}
          {showJump ? (
            <nav className="flex flex-wrap gap-2">
              {category.groups.map((group) => (
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
        </div>
      ) : null}

      {sections.length === 0 ? (
        <div className="flex flex-col items-center gap-3.5 py-12 text-center">
          <p className="text-muted">
            {other
              ? t('emptyOther', {
                  current: category.label,
                  query: query.trim(),
                  other: other.label,
                  count: counts.get(other.key) ?? 0,
                })
              : t('empty', { query: query.trim() })}
          </p>
          {other ? (
            <button
              type="button"
              onClick={() => setCategoryKey(other.key)}
              className="btn-secondary"
            >
              {t('switchTo', { other: other.label })}
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
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
          {section.cards.map(({ tier, items }) => (
            <div key={tier ?? 'all'} className="card-container card-pad-sm flex flex-col gap-3">
              {tier !== null && section.tierLabels ? (
                <span
                  className={`inline-flex h-6 min-w-9 items-center justify-center gap-1.5 self-start rounded-md px-2 text-[13px] font-bold tabular-nums ${TIER_CLASS[tier].badge}`}
                >
                  {section.priced ? (
                    <img src={GAME_ICON.gold} alt="" width={14} height={14} className="size-3.5" />
                  ) : null}
                  {section.tierLabels[tier]}
                </span>
              ) : null}
              <ul className="grid grid-cols-4 gap-x-1.5 gap-y-3.5 md:grid-cols-8 lg:grid-cols-12 lg:gap-x-2 lg:gap-y-4">
                {items.map((entry) => (
                  <li key={entry.key} className="min-w-0">
                    <WikiHoverTip kind={kind} entry={entry} details={details} locale={locale}>
                      <button
                        type="button"
                        onClick={() => setOpenKey(entry.key)}
                        className="group flex w-full flex-col items-center gap-1.5 rounded-md py-1 text-center"
                      >
                        <span className="rounded-md transition-[filter] group-hover:brightness-125">
                          <WikiIcon kind={kind} entry={entry} size="cell" />
                        </span>
                        <span className="line-clamp-2 text-xs leading-4 text-content group-hover:text-heading">
                          {entry.label}
                        </span>
                      </button>
                    </WikiHoverTip>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <WikiDialog
        kind={kind}
        entry={opened}
        details={details}
        locale={locale}
        onClose={() => setOpenKey(null)}
      />
    </>
  );
}
