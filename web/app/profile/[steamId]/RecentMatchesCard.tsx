'use client';

import { ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import InfoPopover from '@/app/components/InfoPopover';
import Skeleton from '@/app/components/ui/skeleton';
import {
  fetchRecentMatches,
  RECENT_MATCH_LIMIT,
  type RecentMatch,
} from '@/app/lib/player-stats-recent';
import { GAME_ICON } from '@/config/game-icons';
import { heroAsset, heroIconPath, heroLabel } from '@/config/heroes';

import type { ReactNode } from 'react';

const COLLAPSED_ROWS = 10;
const SKELETON_ROWS = 3;

// 数据列一律 minmax 加权重：写死宽度的那一版俄文「Поражение」会压到时长上，
// 全给英雄名当 1fr 又会把数字全挤到右边、中间留一大片空。表头再加一层 truncate 兜底
const COLUMNS_CLASS =
  'md:grid-cols-[3px_28px_minmax(84px,1.5fr)_minmax(40px,0.7fr)_minmax(52px,0.6fr)_minmax(92px,0.9fr)_minmax(40px,0.5fr)_minmax(56px,0.7fr)_minmax(56px,0.7fr)_auto_16px]';
const HEAD_CELL = 'min-w-0 truncate';
// 手机一行排不下九项，只留英雄、K/D/A、时长与积分，胜负交给左边的色条
const ROW_CLASS = `flex w-full items-center gap-2.5 border-t border-line px-3 py-2.5 text-left md:grid md:gap-x-3 md:px-4 ${COLUMNS_CLASS}`;
const DESKTOP_ONLY = 'hidden md:block';

type LoadResult =
  | { steamId: string; status: 'failed' }
  | { steamId: string; status: 'ready'; matches: RecentMatch[] };

function formatDuration(durationSec: number): string {
  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.floor(durationSec % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** 金钱与伤害动辄五位数，窄列放不下，上万后缩写 */
function compact(value: number, locale: string): string {
  return value >= 10000
    ? new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    : value.toLocaleString(locale);
}

/** 结算界面用的图标。`label` 为空表示旁边已有文字，只当装饰 */
function GameIcon({ src, label, size = 15 }: { src: string; label?: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 固定尺寸的本地小图，不需要 next/image 的裁剪与响应式
    <img
      src={src}
      alt={label ?? ''}
      title={label}
      width={size}
      height={size}
      className="inline-block shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function HeroIcon({ heroName, awakenLabel }: { heroName: string; awakenLabel?: string }) {
  const icon = heroAsset(heroName)?.icon;
  // 觉醒的是英雄不是这一局，所以标在头像上：紫环不占横向空间，俄文也撑不破行
  const ring = awakenLabel
    ? 'border-feature-awaken/60 shadow-[inset_0_0_0_1px_rgba(221,83,231,0.3)]'
    : 'border-line';
  return (
    <span
      title={awakenLabel}
      className={`flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-control ${ring}`}
    >
      {awakenLabel ? <span className="sr-only">{awakenLabel}</span> : null}
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- 28px 固定尺寸的本地图，不需要 next/image 的裁剪与响应式
        <img
          src={heroIconPath(icon)}
          alt=""
          width={28}
          height={28}
          className="size-full object-cover"
        />
      ) : null}
    </span>
  );
}

interface DetailItem {
  label: ReactNode;
  value: string;
}

function DetailGroup({
  title,
  accentClass,
  items,
}: {
  title: string;
  accentClass: string;
  items: DetailItem[];
}) {
  return (
    <div className="flex min-w-[148px] flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className={`h-2.5 w-0.5 shrink-0 rounded-sm ${accentClass}`} aria-hidden="true" />
        <span className="text-xs text-muted">{title}</span>
      </div>
      <dl className="flex flex-col gap-1.5">
        {items.map((item) => (
          <div
            key={item.value + String(item.label)}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="flex items-center gap-1 text-xs text-faint">{item.label}</dt>
            <dd className="text-[13px] font-semibold tabular-nums text-content">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function RecentMatchesCard({ steamId }: { steamId: string }) {
  const t = useTranslations('profile.recent');
  const tStats = useTranslations('profile.stats');
  const locale = useLocale();
  const [result, setResult] = useState<LoadResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchRecentMatches(steamId)
      .then(({ matches }) => {
        if (!cancelled) {
          setResult({ steamId, status: 'ready', matches });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ steamId, status: 'failed' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [steamId]);

  const loaded = result?.steamId === steamId ? result : null;
  // 一条都没有时表头是空架子，反而让人以为数据没加载出来
  const hasRows = loaded === null || (loaded.status === 'ready' && loaded.matches.length > 0);

  const withIcon = (src: string, text: string) => (
    <>
      <GameIcon src={src} size={13} />
      {text}
    </>
  );

  const detailGroups = (match: RecentMatch) => {
    const groups = [
      {
        title: t('groups.combat'),
        accentClass: 'bg-danger',
        items: [
          {
            label: withIcon(GAME_ICON.damageTaken, tStats('damageTaken')),
            value: match.damageTaken.toLocaleString(locale),
          },
          {
            label: withIcon(GAME_ICON.healing, tStats('healing')),
            value: match.healing.toLocaleString(locale),
          },
          { label: t('stuns'), value: match.stuns.toFixed(1) },
        ],
      },
      {
        title: t('groups.growth'),
        accentClass: 'bg-member-strong',
        items: [
          { label: t('level'), value: match.level.toLocaleString(locale) },
          { label: tStats('towerKills'), value: match.towerKills.toLocaleString(locale) },
          { label: t('roshanKills'), value: match.roshanKills.toLocaleString(locale) },
        ],
      },
    ];

    // 游戏端发版前的场次没有属性，整组不出现
    if (match.strength !== undefined) {
      groups.push({
        title: t('groups.attributes'),
        accentClass: 'bg-feature-awaken',
        items: [
          {
            label: withIcon(GAME_ICON.strength, t('strength')),
            value: `${Math.round(match.strength)}`,
          },
          {
            label: withIcon(GAME_ICON.agility, t('agility')),
            value: `${Math.round(match.agility ?? 0)}`,
          },
          {
            label: withIcon(GAME_ICON.intellect, t('intellect')),
            value: `${Math.round(match.intellect ?? 0)}`,
          },
        ],
      });
    }

    return groups;
  };

  return (
    <section className="card-container @container pt-4 pb-2" aria-busy={!loaded}>
      <div className="flex items-center gap-1.5 px-3 md:px-4">
        <h2 className="title-secondary">{t('title')}</h2>
        {/* 「只留 50 场」是一次性知识，常驻一行字占地方，收进说明弹层 */}
        <InfoPopover label={t('noteLabel')}>
          <p className="text-content">{t('note', { count: RECENT_MATCH_LIMIT })}</p>
        </InfoPopover>
      </div>

      {/* 表头把每局都要横着比的几项换成结算界面的图标：窄列放得下，玩家也认得出 */}
      <div
        className={`mt-3 px-4 pb-2 text-xs text-muted md:items-center md:gap-x-3 ${
          hasRows ? 'hidden md:grid' : 'hidden'
        } ${COLUMNS_CLASS}`}
      >
        <span />
        <span />
        <span className={HEAD_CELL}>{t('columns.hero')}</span>
        <span className={HEAD_CELL} title={t('columns.result')}>
          {t('columns.result')}
        </span>
        <span className={HEAD_CELL} title={t('columns.duration')}>
          {t('columns.duration')}
        </span>
        <span className={HEAD_CELL}>{t('columns.kda')}</span>
        <span className={HEAD_CELL} title={tStats('lastHits')}>
          {t('columns.lastHits')}
        </span>
        <span>
          <GameIcon src={GAME_ICON.gold} label={tStats('totalGoldEarned')} />
        </span>
        <span>
          <GameIcon src={GAME_ICON.heroDamage} label={tStats('heroDamage')} />
        </span>
        <span className="text-right">
          <GameIcon src={GAME_ICON.battlePoint} label={t('columns.points')} />
        </span>
        <span />
      </div>

      {loaded === null ? (
        <ul>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <li key={index} className={ROW_CLASS}>
              <span className="hidden md:block" />
              <span className="size-7 shrink-0 animate-pulse rounded-md bg-line" />
              <span className="min-w-0 flex-1">
                <Skeleton>Keeper of the Light</Skeleton>
              </span>
              <span className="md:col-start-10 md:text-right">
                <Skeleton>+000</Skeleton>
              </span>
            </li>
          ))}
        </ul>
      ) : loaded.status === 'failed' ? (
        <p className="px-3 pt-2 pb-4 text-sm text-muted md:px-4">{t('failed')}</p>
      ) : loaded.matches.length === 0 ? (
        <p className="px-3 pt-2 pb-4 text-sm text-muted md:px-4">{t('empty')}</p>
      ) : (
        <>
          <ul>
            {/* 展开只是加长同一份列表，下标就是这一行的身份；matchId 控制台开局恒为 0，当不了 key */}
            {(expanded ? loaded.matches : loaded.matches.slice(0, COLLAPSED_ROWS)).map(
              (match, index) => {
                const open = openRow === index;
                const kda = `${match.kills} / ${match.deaths} / ${match.assists}`;
                return (
                  <li key={index}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenRow(open ? null : index)}
                      className={`${ROW_CLASS} transition-colors hover:bg-panel-soft`}
                    >
                      <span
                        className={`h-6 w-[3px] shrink-0 rounded-sm ${match.win ? 'bg-success' : 'bg-danger'}`}
                        aria-hidden="true"
                      />
                      <HeroIcon
                        heroName={match.heroName}
                        awakenLabel={match.awaken > 0 ? t('awaken') : undefined}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm text-heading">
                            {heroLabel(match.heroName, locale)}
                          </span>
                          {match.isDisconnected ? (
                            <span className="shrink-0 rounded bg-control px-1.5 py-px text-[11px] text-muted">
                              {t('disconnected')}
                            </span>
                          ) : null}
                        </span>
                        {/* 手机把结果交给色条，时长与 K/D/A 挪到第二行 */}
                        <span className="text-[11px] tabular-nums text-faint md:hidden">
                          {kda} · {formatDuration(match.durationSec)}
                        </span>
                      </span>
                      <span
                        className={`${DESKTOP_ONLY} text-[13px] font-medium ${match.win ? 'text-success' : 'text-danger'}`}
                      >
                        {t(match.win ? 'win' : 'loss')}
                      </span>
                      <span className={`${DESKTOP_ONLY} text-[13px] tabular-nums text-content`}>
                        {formatDuration(match.durationSec)}
                      </span>
                      <span className={`${DESKTOP_ONLY} text-sm tabular-nums text-heading`}>
                        {kda}
                      </span>
                      <span className={`${DESKTOP_ONLY} text-[13px] tabular-nums text-muted`}>
                        {match.lastHits.toLocaleString(locale)}
                      </span>
                      <span className={`${DESKTOP_ONLY} text-[13px] tabular-nums text-muted`}>
                        {compact(match.totalGoldEarned, locale)}
                      </span>
                      <span className={`${DESKTOP_ONLY} text-[13px] tabular-nums text-muted`}>
                        {compact(match.heroDamage, locale)}
                      </span>
                      <span className="flex shrink-0 items-center justify-end gap-1 text-sm font-bold tabular-nums text-season">
                        {/* 手机没有表头，那一列数字只能靠图标说明自己是什么 */}
                        <span className="md:hidden">
                          <GameIcon
                            src={GAME_ICON.battlePoint}
                            label={t('columns.points')}
                            size={13}
                          />
                        </span>
                        {t('points', { n: match.battlePoints })}
                      </span>
                      <ChevronDown
                        className={`hidden size-4 shrink-0 text-faint transition-transform md:block ${open ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                    {open ? (
                      <div className="border-t border-line bg-panel-soft px-3 py-3 md:px-4">
                        <div className="flex flex-wrap gap-x-8 gap-y-4">
                          {detailGroups(match).map((group) => (
                            <DetailGroup key={group.title} {...group} />
                          ))}
                        </div>
                        <p className="mt-3 border-t border-line pt-2 text-xs text-faint">
                          {t('footer', { difficulty: match.difficulty, version: match.version })}
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              },
            )}
          </ul>
          {loaded.matches.length > COLLAPSED_ROWS ? (
            <div className="border-t border-line px-3 py-2 text-center md:px-4">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="link-hover text-sm"
              >
                {t(expanded ? 'collapse' : 'showAll', { count: loaded.matches.length })}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
