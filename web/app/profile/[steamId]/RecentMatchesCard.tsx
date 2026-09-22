'use client';

import { ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import Skeleton from '@/app/components/ui/skeleton';
import {
  fetchRecentMatches,
  RECENT_MATCH_LIMIT,
  type RecentMatch,
} from '@/app/lib/player-stats-recent';
import { heroAsset, heroIconPath, heroLabel } from '@/config/heroes';

import StatList from './StatList';

const COLLAPSED_ROWS = 10;
const SKELETON_ROWS = 3;

const COLUMNS_CLASS = 'md:grid-cols-[28px_1fr_56px_64px_96px_64px]';
// 手机两行：第一行英雄与胜负，第二行时长、K/D/A 与积分。md 以上两个内层 contents
// 把六个格子摊回外层网格，DOM 只有一套
const ROW_CLASS = `flex w-full flex-col gap-1 border-t border-line px-3 py-2.5 text-left md:grid md:items-center md:gap-x-3 md:px-4 ${COLUMNS_CLASS}`;
const LINE_CLASS = 'flex items-center gap-3 md:contents';

type LoadResult =
  | { steamId: string; status: 'failed' }
  | { steamId: string; status: 'ready'; matches: RecentMatch[] };

function formatDuration(durationSec: number): string {
  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.floor(durationSec % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

  return (
    <section className="card-container @container pt-4 pb-2" aria-busy={!loaded}>
      <div className="space-y-1.5 px-3 md:px-4">
        <h2 className="title-secondary">{t('title')}</h2>
        <p className="text-sm text-muted">{t('note', { count: RECENT_MATCH_LIMIT })}</p>
      </div>

      <div
        className={`mt-3 hidden px-4 pb-2 text-xs text-muted md:grid md:gap-x-3 ${COLUMNS_CLASS}`}
      >
        <span />
        <span>{t('columns.hero')}</span>
        <span>{t('columns.result')}</span>
        <span>{t('columns.duration')}</span>
        <span>{t('columns.kda')}</span>
        <span className="text-right">{t('columns.points')}</span>
      </div>

      {loaded === null ? (
        <ul>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <li key={index} className={ROW_CLASS}>
              <span className={LINE_CLASS}>
                <span className="size-7 shrink-0 animate-pulse rounded-md bg-line" />
                <Skeleton>Keeper of the Light</Skeleton>
              </span>
              <span className={`${LINE_CLASS} pl-10 md:pl-0`}>
                <Skeleton>00:00</Skeleton>
                <span className="ml-auto">
                  <Skeleton>+000</Skeleton>
                </span>
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
                return (
                  <li key={index}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenRow(open ? null : index)}
                      className={`${ROW_CLASS} transition-colors hover:bg-panel-soft`}
                    >
                      <span className={LINE_CLASS}>
                        <HeroIcon heroName={match.heroName} />
                        <span className="min-w-0 flex-1 truncate text-sm text-heading">
                          {heroLabel(match.heroName, locale)}
                          {match.awaken > 0 ? (
                            <span className="ml-1.5 text-xs text-feature-awaken">
                              {t('awaken')}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`shrink-0 text-sm font-medium ${match.win ? 'text-success' : 'text-danger'}`}
                        >
                          {t(match.win ? 'win' : 'loss')}
                          {match.isDisconnected ? (
                            <span className="ml-1.5 text-xs text-muted">{t('disconnected')}</span>
                          ) : null}
                        </span>
                      </span>
                      {/* 手机上与上一行的英雄名左对齐 */}
                      <span className={`${LINE_CLASS} pl-10 md:pl-0`}>
                        <span className="text-sm text-content tabular-nums">
                          {formatDuration(match.durationSec)}
                        </span>
                        <span className="text-sm text-content tabular-nums">
                          {match.kills} / {match.deaths} / {match.assists}
                        </span>
                        <span className="ml-auto flex items-center justify-end gap-1 text-sm font-bold text-season tabular-nums">
                          {t('points', { n: match.battlePoints })}
                          <ChevronDown
                            className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                          />
                        </span>
                      </span>
                    </button>
                    {open ? (
                      <div className="border-t border-line bg-panel-soft px-3 py-3 md:px-4">
                        <StatList
                          items={[
                            { label: t('level'), value: match.level.toLocaleString() },
                            { label: tStats('lastHits'), value: match.lastHits.toLocaleString() },
                            {
                              label: tStats('totalGoldEarned'),
                              value: match.totalGoldEarned.toLocaleString(),
                            },
                            {
                              label: tStats('heroDamage'),
                              value: match.heroDamage.toLocaleString(),
                            },
                            {
                              label: tStats('damageTaken'),
                              value: match.damageTaken.toLocaleString(),
                            },
                            { label: tStats('healing'), value: match.healing.toLocaleString() },
                            {
                              label: tStats('towerKills'),
                              value: match.towerKills.toLocaleString(),
                            },
                            { label: t('stuns'), value: match.stuns.toFixed(1) },
                            { label: t('roshanKills'), value: match.roshanKills.toLocaleString() },
                            // 游戏端发版前的场次没有属性，整段不出现
                            ...(match.strength === undefined
                              ? []
                              : [
                                  { label: t('strength'), value: `${Math.round(match.strength)}` },
                                  {
                                    label: t('agility'),
                                    value: `${Math.round(match.agility ?? 0)}`,
                                  },
                                  {
                                    label: t('intellect'),
                                    value: `${Math.round(match.intellect ?? 0)}`,
                                  },
                                ]),
                            { label: t('difficulty'), value: `N${match.difficulty}` },
                            { label: t('version'), value: match.version },
                          ]}
                        />
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

function HeroIcon({ heroName }: { heroName: string }) {
  const icon = heroAsset(heroName)?.icon;
  if (!icon) {
    return <span className="size-7 rounded-md border border-line bg-control" aria-hidden="true" />;
  }
  return (
    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-control">
      {/* eslint-disable-next-line @next/next/no-img-element -- 28px 固定尺寸的本地图，不需要 next/image 的裁剪与响应式 */}
      <img
        src={heroIconPath(icon)}
        alt=""
        width={28}
        height={28}
        className="size-full object-cover"
      />
    </span>
  );
}
