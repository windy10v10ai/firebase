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
import { abilityAsset, abilityIconPath, abilityLabel } from '@/config/abilities';
import { GAME_ICON } from '@/config/game-icons';
import { heroAsset, heroIconPath, heroLabel } from '@/config/heroes';
import {
  EMPTY_SLOT_ICON,
  itemAsset,
  itemIconPath,
  itemLabel,
  RECIPE_ICON,
  recipeResult,
} from '@/config/items';

import type { ReactNode } from 'react';

const COLLAPSED_ROWS = 10;
const SKELETON_ROWS = 3;

// 表头与每一行是各自独立的网格，只要有一条轨道按内容伸缩，两边算出来的宽度就不一样、整行错开，
// 所以每一列都写成 minmax(定值, 权重)。英雄名只拿 0.6fr，余量摊给数字列，否则名字后面空出一大片；
// 1024 以上再补一列承受伤害。写死宽度的那一版俄文「Поражение」会压到时长上，也不能回去
const COLUMNS_CLASS =
  'md:grid-cols-[3px_48px_32px_28px_minmax(72px,0.6fr)_minmax(48px,0.8fr)_minmax(96px,0.9fr)_minmax(46px,0.85fr)_minmax(56px,0.95fr)_minmax(64px,0.95fr)_minmax(48px,0.6fr)_16px] lg:grid-cols-[3px_48px_32px_28px_minmax(84px,0.6fr)_minmax(52px,0.7fr)_minmax(100px,0.8fr)_minmax(46px,0.7fr)_minmax(60px,0.8fr)_minmax(68px,0.8fr)_minmax(68px,0.8fr)_minmax(52px,0.6fr)_16px]';
// 手机一行排不下十项，只留难度、英雄、等级、K/D/A、时长与积分
const ROW_CLASS = `flex w-full items-center gap-2.5 border-t border-line px-3 py-2.5 text-left md:grid md:gap-x-3 md:px-4 ${COLUMNS_CLASS}`;
const DESKTOP_ONLY = 'hidden md:block';
const WIDE_ONLY = 'hidden lg:block';
const NUMBER_CELL = 'text-right text-[13px] tabular-nums text-muted';
// 表头每一格整格可悬停：提示只挂在 15px 的图标上时，鼠标得正好压中才出得来
const HEAD_TRIGGER =
  'flex w-full min-w-0 items-center text-muted transition-colors hover:text-heading';
const HEAD_END = `${HEAD_TRIGGER} justify-end`;
const HEAD_CENTER = `${HEAD_TRIGGER} justify-center`;
/** 游戏里 1–8 对应 N1–N8，其余取值都是自定义模式 */
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 8;

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

/** 结算界面用的图标。`label` 为空表示旁边已有文字或提示，只当装饰 */
function GameIcon({ src, label, size = 15 }: { src: string; label?: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 固定尺寸的本地小图，不需要 next/image 的裁剪与响应式
    <img
      src={src}
      alt={label ?? ''}
      width={size}
      height={size}
      className="inline-block shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

/** 难度是整行的前提：N8 的补刀、金钱、伤害整体都比 N3 高，所以排在所有读数之前 */
function DifficultyBadge({ difficulty, customLabel }: { difficulty: number; customLabel: string }) {
  const known =
    Number.isInteger(difficulty) && difficulty >= MIN_DIFFICULTY && difficulty <= MAX_DIFFICULTY;
  return (
    // 宽度写死：按文字伸缩时「自定义」比 N8 宽一截，后面的等级、头像、英雄名各行就错开了
    <span className="inline-flex w-12 shrink-0 items-center justify-center rounded border border-line-strong bg-panel-raised px-1 py-px text-[10px] font-semibold whitespace-nowrap text-content">
      {known ? `N${difficulty}` : customLabel}
    </span>
  );
}

/** 照搬游戏结算界面的等级圈：同样的暗金描边与字色，尺寸按这一行的高度缩到 23px */
function LevelRing({ level, locale }: { level: number; locale: string }) {
  return (
    <span className="hidden size-[23px] shrink-0 items-center justify-center justify-self-center rounded-full border border-hero-level-border bg-surface text-[12px] tracking-[0.5px] tabular-nums text-hero-level shadow-[inset_0_0_8px_rgba(0,0,0,0.9)] md:inline-flex">
      {level.toLocaleString(locale)}
    </span>
  );
}

/** 击杀绿、死亡红、助攻白：三段含义固定，不按这局打得好不好变色 */
function Kda({ kills, deaths, assists }: { kills: number; deaths: number; assists: number }) {
  return (
    <span className={`${DESKTOP_ONLY} text-center text-sm tabular-nums`}>
      <span className="text-success">{kills}</span>
      <span className="px-1 text-faint">/</span>
      <span className="text-danger">{deaths}</span>
      <span className="px-1 text-faint">/</span>
      <span className="text-heading">{assists}</span>
    </span>
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

type SlotKind = 'item' | 'ability';

// 照游戏结算界面画：近黑细边、不圆角；物品图原尺寸 88×64，按一半展示两倍屏正好不糊。
// 中立槽也是方格，圆槽是局内 HUD 的样子，结算界面里没有
const SLOT_BOX =
  'flex shrink-0 items-center justify-center overflow-hidden border border-surface bg-surface';
const SLOT_SIZE: Record<SlotKind, string> = { item: 'h-8 w-11', ability: 'size-8' };

/** 空格也占位，六格一眼能看出这局有没有出满 */
function LoadoutSlot({ kind, name, locale }: { kind: SlotKind; name?: string; locale: string }) {
  const t = useTranslations('profile.recent');
  const box = `${SLOT_BOX} ${SLOT_SIZE[kind]}`;
  if (!name) {
    // 技能没有空槽底图，画成和等级圈同样的凹陷
    return kind === 'item' ? (
      <span className={box} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- 固定尺寸的本地小图，不需要 next/image 的裁剪与响应式 */}
        <img src={EMPTY_SLOT_ICON} alt="" className="size-full" />
      </span>
    ) : (
      <span className={`${box} shadow-[inset_0_0_6px_rgba(0,0,0,0.9)]`} aria-hidden="true" />
    );
  }

  let src: string | null;
  let label: string;
  const recipeOf = kind === 'item' ? recipeResult(name) : null;
  if (recipeOf) {
    src = RECIPE_ICON;
    label = t('recipe', { name: itemLabel(recipeOf, locale) });
  } else if (kind === 'item') {
    const icon = itemAsset(name)?.icon;
    src = icon ? itemIconPath(icon) : null;
    label = itemLabel(name, locale);
  } else {
    const icon = abilityAsset(name)?.icon;
    src = icon ? abilityIconPath(icon) : null;
    label = abilityLabel(name, locale);
  }

  return (
    <InfoPopover
      label={label}
      compact
      className={`${box} transition-colors hover:border-line-strong`}
      trigger={
        src ? (
          // eslint-disable-next-line @next/next/no-img-element -- 固定尺寸的本地小图，不需要 next/image 的裁剪与响应式
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          // 有东西但没图：和空槽区分开，名字仍在提示里
          <span className="text-[13px] text-faint">?</span>
        )
      }
    >
      {label}
    </InfoPopover>
  );
}

function GroupTitle({ title, accentClass }: { title: string; accentClass: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-0.5 shrink-0 rounded-sm ${accentClass}`} aria-hidden="true" />
      <span className="text-xs text-muted">{title}</span>
    </div>
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
    <div className="flex min-w-0 flex-col gap-2">
      <GroupTitle title={title} accentClass={accentClass} />
      <dl className="flex flex-col gap-y-1.5">
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

  /** 列名缩写成 Слож.、LH 才放得下，全称收进提示里 */
  const headCell = (className: string, full: string, trigger: ReactNode) => (
    <InfoPopover label={full} compact className={className} trigger={trigger}>
      {full}
    </InfoPopover>
  );

  const headText = (short: string) => <span className="truncate">{short}</span>;

  const detailGroups = (match: RecentMatch) => {
    const groups = [
      {
        title: t('groups.combat'),
        accentClass: 'bg-danger',
        items: [
          {
            label: withIcon(GAME_ICON.heroDamage, tStats('heroDamage')),
            value: match.heroDamage.toLocaleString(locale),
          },
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
          {
            label: withIcon(GAME_ICON.gold, tStats('totalGoldEarned')),
            value: match.totalGoldEarned.toLocaleString(locale),
          },
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
        {headCell(HEAD_CENTER, t('columnsFull.difficulty'), headText(t('columns.difficulty')))}
        {headCell(HEAD_CENTER, t('columnsFull.level'), headText(t('columns.level')))}
        <span />
        <span className="min-w-0 truncate">{t('columns.hero')}</span>
        {headCell(HEAD_END, t('columnsFull.duration'), headText(t('columns.duration')))}
        {headCell(
          HEAD_CENTER,
          `${tStats('kills')} / ${tStats('deaths')} / ${tStats('assists')}`,
          headText(t('columns.kda')),
        )}
        {headCell(HEAD_END, tStats('lastHits'), headText(t('columns.lastHits')))}
        {headCell(HEAD_END, tStats('totalGoldEarned'), <GameIcon src={GAME_ICON.gold} />)}
        {headCell(HEAD_END, tStats('heroDamage'), <GameIcon src={GAME_ICON.heroDamage} />)}
        <span className={WIDE_ONLY}>
          {headCell(HEAD_END, tStats('damageTaken'), <GameIcon src={GAME_ICON.damageTaken} />)}
        </span>
        {headCell(HEAD_END, t('columns.points'), <GameIcon src={GAME_ICON.battlePoint} />)}
        <span />
      </div>

      {loaded === null ? (
        <ul>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <li key={index} className={ROW_CLASS}>
              <span className="hidden md:block" />
              <span className="h-4 w-12 shrink-0 animate-pulse rounded bg-line" />
              <span className="hidden size-[23px] shrink-0 animate-pulse justify-self-center rounded-full bg-line md:block" />
              <span className="size-7 shrink-0 animate-pulse rounded-md bg-line" />
              <span className="min-w-0 flex-1">
                <Skeleton>Keeper of the Light</Skeleton>
              </span>
              <span className="md:col-start-11 md:text-right lg:col-start-12">
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
                const groups = detailGroups(match);
                const kda = `${match.kills} / ${match.deaths} / ${match.assists}`;
                return (
                  <li key={index}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenRow(open ? null : index)}
                      className={`${ROW_CLASS} transition-colors hover:bg-panel-soft`}
                    >
                      {/* 胜负只用色条表示，文字留给读屏与悬停 */}
                      <span
                        title={t(match.win ? 'win' : 'loss')}
                        className={`h-6 w-[3px] shrink-0 rounded-sm ${match.win ? 'bg-success' : 'bg-danger'}`}
                      >
                        <span className="sr-only">{t(match.win ? 'win' : 'loss')}</span>
                      </span>
                      <DifficultyBadge
                        difficulty={match.difficulty}
                        customLabel={t('difficultyCustom')}
                      />
                      <LevelRing level={match.level} locale={locale} />
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
                        {/* 手机把结果交给色条，等级、时长与 K/D/A 挪到第二行 */}
                        <span className="text-[11px] tabular-nums text-faint md:hidden">
                          {t('levelShort', { n: match.level })} · {kda} ·{' '}
                          {formatDuration(match.durationSec)}
                        </span>
                      </span>
                      <span
                        className={`${DESKTOP_ONLY} text-right text-[13px] tabular-nums text-content`}
                      >
                        {formatDuration(match.durationSec)}
                      </span>
                      <Kda kills={match.kills} deaths={match.deaths} assists={match.assists} />
                      <span className={`${DESKTOP_ONLY} ${NUMBER_CELL}`}>
                        {match.lastHits.toLocaleString(locale)}
                      </span>
                      <span className={`${DESKTOP_ONLY} ${NUMBER_CELL}`}>
                        {compact(match.totalGoldEarned, locale)}
                      </span>
                      <span className={`${DESKTOP_ONLY} ${NUMBER_CELL}`}>
                        {compact(match.heroDamage, locale)}
                      </span>
                      <span className={`${WIDE_ONLY} ${NUMBER_CELL}`}>
                        {compact(match.damageTaken, locale)}
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
                      <div className="@container border-t border-line bg-panel-soft px-3 py-3 md:px-4">
                        {/* 出装一行要 400 多像素，并排后三组数据变窄会挤断俄文标签，所以按面板宽度决定放右侧还是下方 */}
                        <div
                          className={`grid gap-x-7 gap-y-4 ${
                            groups.length === 3
                              ? 'md:grid-cols-3 @6xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]'
                              : 'md:grid-cols-2'
                          }`}
                        >
                          {groups.map((group) => (
                            <DetailGroup key={group.title} {...group} />
                          ))}
                          {/* 出装与属性同批上报，旧场次整块不出现 */}
                          {match.items ? (
                            <div className="flex flex-wrap gap-x-7 gap-y-4 col-span-full @6xl:col-span-1 @6xl:flex-col @6xl:flex-nowrap @6xl:gap-y-3 @6xl:border-l @6xl:border-line @6xl:pl-7">
                              <div className="flex flex-col gap-2">
                                <GroupTitle
                                  title={t('groups.items')}
                                  accentClass="bg-line-strong"
                                />
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                  <div className="flex gap-1">
                                    {/* 物品栏位置固定，下标就是格子的身份 */}
                                    {match.items.map((item, slot) => (
                                      <LoadoutSlot
                                        key={slot}
                                        kind="item"
                                        name={item}
                                        locale={locale}
                                      />
                                    ))}
                                  </div>
                                  <div className="flex gap-1">
                                    <LoadoutSlot
                                      kind="item"
                                      name={match.neutralItem}
                                      locale={locale}
                                    />
                                    <LoadoutSlot
                                      kind="item"
                                      name={match.neutralPassiveItem}
                                      locale={locale}
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <GroupTitle
                                  title={t('groups.abilities')}
                                  accentClass="bg-line-strong"
                                />
                                <div className="flex gap-1">
                                  {(match.abilities ?? []).map((ability, slot) => (
                                    <LoadoutSlot
                                      key={slot}
                                      kind="ability"
                                      name={ability}
                                      locale={locale}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
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
