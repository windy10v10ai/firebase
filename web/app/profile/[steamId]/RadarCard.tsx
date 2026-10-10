'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';
import {
  battleRadarCorners,
  type BattleRadarCorner,
  type PlayerStatsRadarResponse,
} from '@/app/lib/player-stats-radar';
import { statsRadarQuery } from '@/app/lib/queries';

type LoadResult =
  | { status: 'failed' }
  | { status: 'ready'; data: PlayerStatsRadarResponse };

type LabelSide = 'top' | 'bottom' | 'left' | 'right';

// 顺时针从左上角排：打人的两项在上，生存与辅助在下；左右两角标签贴着图边，只放短词
const AXES: { key: BattleRadarCorner; deg: number; side: LabelSide }[] = [
  { key: 'damage', deg: 240, side: 'top' },
  { key: 'participation', deg: 300, side: 'top' },
  { key: 'gold', deg: 0, side: 'right' },
  { key: 'survival', deg: 60, side: 'bottom' },
  { key: 'support', deg: 120, side: 'bottom' },
  { key: 'push', deg: 180, side: 'left' },
];

const VIEW_WIDTH = 300;
const VIEW_HEIGHT = 260;
const CENTER_X = 150;
const CENTER_Y = 132;
const RADIUS = 80;
// 落后的玩家也要画得出形状，百分位 0 落在中心底的边上而不是圆心
const FLOOR_RATIO = 0.2;
// 网格均分中心底到外圈这一段，四层等距
const GRID_RATIOS = [1 / 3, 2 / 3].map((part) => FLOOR_RATIO + (1 - FLOOR_RATIO) * part);

function point(deg: number, ratio: number) {
  const angle = (deg * Math.PI) / 180;
  return {
    x: CENTER_X + Math.cos(angle) * RADIUS * ratio,
    y: CENTER_Y + Math.sin(angle) * RADIUS * ratio,
  };
}

function polygon(ratioOf: (key: BattleRadarCorner) => number): string {
  return AXES.map(({ key, deg }) => {
    const { x, y } = point(deg, ratioOf(key));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function ratioOfPercentile(percentile: number): number {
  return FLOOR_RATIO + ((1 - FLOOR_RATIO) * Math.min(100, Math.max(0, percentile))) / 100;
}

function labelLayout(deg: number, side: LabelSide) {
  const { x, y } = point(deg, 1);
  switch (side) {
    case 'top':
      return { x, anchor: 'middle', nameY: y - 26, valueY: y - 9 } as const;
    case 'bottom':
      return { x, anchor: 'middle', nameY: y + 20, valueY: y + 38 } as const;
    case 'left':
      return { x: x - 12, anchor: 'end', nameY: y - 5, valueY: y + 14 } as const;
    case 'right':
      return { x: x + 12, anchor: 'start', nameY: y - 5, valueY: y + 14 } as const;
  }
}

export default function RadarCard({ steamId }: { steamId: string }) {
  const t = useTranslations('profile.radar');
  const query = useQuery(statsRadarQuery(steamId));


  const loaded: LoadResult | null = query.data
    ? { status: 'ready', data: query.data }
    : query.isError
      ? { status: 'failed' }
      : null;
  const data = loaded?.status === 'ready' ? loaded.data : null;
  const radar = data?.radar ? battleRadarCorners(data.radar) : null;

  let overlay: string | null = null;
  if (loaded?.status === 'failed') {
    overlay = t('failed');
  } else if (data && !radar) {
    overlay = t('needMore', { count: Math.max(1, data.minMatchCount - data.matchCount) });
  }

  const summary = radar
    ? AXES.map(({ key }) => `${t(`axes.${key}`)} ${radar[key]}`).join(', ')
    : undefined;

  return (
    <section className="card-container card-pad flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="title-secondary">{t('title')}</h2>
        <span className="shrink-0 text-xs whitespace-nowrap text-muted">
          {loaded ? (
            data ? (
              t('matches', { count: data.matchCount })
            ) : null
          ) : (
            <Skeleton>{t('matches', { count: 50 })}</Skeleton>
          )}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="relative w-full max-w-[340px]">
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="block w-full"
            role="img"
            aria-label={summary ?? t('title')}
          >
            <polygon
              points={polygon(() => 1)}
              className="fill-radar-plate/20 stroke-radar-grid/30"
              strokeWidth={1.5}
            />
            <polygon
            points={polygon(() => FLOOR_RATIO)}
            className="fill-radar-grid/20 stroke-radar-grid/35"
            strokeWidth={1}
          />
          {GRID_RATIOS.map((ratio) => (
              <polygon
                key={ratio}
                points={polygon(() => ratio)}
                className="fill-none stroke-radar-grid/25"
                strokeWidth={1}
              />
            ))}
            {AXES.map(({ key, deg }) => {
              const end = point(deg, 1);
              return (
                <line
                  key={key}
                  x1={CENTER_X}
                  y1={CENTER_Y}
                  x2={end.x}
                  y2={end.y}
                  className="stroke-radar-grid/25"
                  strokeWidth={1}
                />
              );
            })}
            {radar ? (
              <>
                <polygon
                  points={polygon((key) => ratioOfPercentile(radar[key]))}
                  className="fill-radar-fill/30 stroke-radar"
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                />
                {AXES.map(({ key, deg }) => {
                  const { x, y } = point(deg, ratioOfPercentile(radar[key]));
                  return <circle key={key} cx={x} cy={y} r={4} className="fill-radar" />;
                })}
              </>
            ) : null}
            {AXES.map(({ key, deg, side }) => {
              const { x, anchor, nameY, valueY } = labelLayout(deg, side);
              return (
                <g key={key} textAnchor={anchor} aria-hidden="true">
                  <text x={x} y={nameY} className="fill-muted text-[12px]">
                    {t(`axes.${key}`)}
                  </text>
                  {radar ? (
                    <text
                      x={x}
                      y={valueY}
                      className="fill-heading text-[16px] font-bold tabular-nums"
                    >
                      {radar[key]}
                    </text>
                  ) : loaded ? (
                    <text x={x} y={valueY} className="fill-faint text-[16px] font-bold">
                      –
                    </text>
                  ) : (
                    <rect
                      x={anchor === 'start' ? x : anchor === 'end' ? x - 24 : x - 12}
                      y={valueY - 13}
                      width={24}
                      height={15}
                      rx={3}
                      className="animate-pulse fill-line"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          {overlay ? (
            <p className="absolute top-1/2 left-1/2 max-w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line-strong bg-panel-soft px-3 py-1.5 text-center text-sm text-content">
              {overlay}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
