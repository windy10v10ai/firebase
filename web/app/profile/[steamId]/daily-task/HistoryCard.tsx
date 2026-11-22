import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';
import { HISTORY_DAY_LIMIT, ROUNDS_PER_DAY } from '@/config/daily-task';

import TaskSlot from './TaskSlot';

import type { DailyTaskHistoryEntry, DailyTaskSnapshot } from '@/app/lib/daily-task';

const GRID_CLASS = 'md:grid-cols-[72px_1fr_80px]';
const ROW_CLASS = `grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line px-3 py-2.5 md:items-center md:px-4 ${GRID_CLASS}`;

/** `20260921` → `09-21`。只到月日，与游戏内一致 */
function formatDayId(dayId: string): string {
  return /^\d{8}$/.test(dayId) ? `${dayId.slice(4, 6)}-${dayId.slice(6, 8)}` : dayId;
}

/** 今天往前数满 `HISTORY_DAY_LIMIT` 个日历日的第一天，天号是定宽数字串，可以直接按字符串比较 */
function windowStartDayId(today: string): string {
  const date = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8))),
  );
  date.setUTCDate(date.getUTCDate() - (HISTORY_DAY_LIMIT - 1));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-bold text-heading">{children}</dd>
    </div>
  );
}

/**
 * 历史：顶部是最近 30 天的总量，下面一行一天，今天固定排第一行。
 * 日期不连续：没完成任务的日子根本不进历史，不补空日，日历格子会把「没打游戏」和「打了但没完成」画成同一个空格。
 * 后端按条数保留历史，列表照单全列；只有汇总按日历窗口筛，今天的进度也算在窗口里。
 */
export default function HistoryCard({ snapshot }: { snapshot: DailyTaskSnapshot | null }) {
  const t = useTranslations('dailyTask');

  const past: DailyTaskHistoryEntry[] | null = snapshot ? (snapshot.history ?? []) : null;
  const counted =
    snapshot && past
      ? [
          {
            dayId: snapshot.dayId,
            tasks: snapshot.completedTasks,
            seasonPoint: snapshot.todaySeasonPoint,
          },
          ...past,
        ].filter(
          (entry) => entry.tasks.length > 0 && entry.dayId >= windowStartDayId(snapshot.dayId),
        )
      : null;

  const days = counted?.length ?? null;
  const points = counted?.reduce((sum, entry) => sum + entry.seasonPoint, 0) ?? null;

  const todayDone = snapshot ? Math.min(snapshot.completedTasks.length, ROUNDS_PER_DAY) : 0;

  return (
    <section className="card-container pt-4 pb-2">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-3 md:px-4">
        <h2 className="text-lg font-bold text-heading">{t('history')}</h2>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-end md:gap-8">
          <p className="text-xs font-bold text-heading md:pb-0.5">
            {t('summary.title', { days: HISTORY_DAY_LIMIT })}
          </p>
          <dl className="grid grid-cols-2 gap-2 md:flex md:gap-8">
            <Stat label={t('summary.days')}>
              {days === null ? <Skeleton>00</Skeleton> : t('summary.dayCount', { n: days })}
            </Stat>
            <Stat label={t('summary.points')}>
              <span className="text-season">
                {points === null ? <Skeleton>0,000</Skeleton> : points.toLocaleString()}
              </span>
            </Stat>
          </dl>
        </div>
      </div>

      <div
        className={`mt-3 hidden px-3 pb-2 text-xs text-muted md:grid md:gap-3 md:px-4 ${GRID_CLASS}`}
      >
        <span>{t('columns.date')}</span>
        <span>{t('columns.tasks')}</span>
        <span className="text-right">{t('columns.points')}</span>
      </div>

      <ul className="mt-3 md:mt-0">
        {snapshot === null || past === null
          ? Array.from({ length: 3 }, (_, index) => (
              <li key={index} className={ROW_CLASS}>
                <Skeleton>00-00</Skeleton>
                <span className="text-right md:order-3">
                  <Skeleton>+000</Skeleton>
                </span>
                <div className="col-span-2 grid grid-cols-3 gap-2 md:order-2 md:col-span-1">
                  {Array.from({ length: ROUNDS_PER_DAY }, (_, slot) => (
                    <TaskSlot key={slot} task={null} fallback="loading" />
                  ))}
                </div>
              </li>
            ))
          : [
              <li key={snapshot.dayId} className={`${ROW_CLASS} bg-panel-soft`}>
                <span className="text-sm font-bold text-heading">{t('today')}</span>
                <span
                  className={`text-right text-sm font-bold md:order-3 ${
                    snapshot.todaySeasonPoint > 0 ? 'text-season' : 'text-muted'
                  }`}
                >
                  {t('reward', { n: snapshot.todaySeasonPoint })}
                </span>
                <div className="col-span-2 grid grid-cols-3 gap-2 md:order-2 md:col-span-1">
                  {Array.from({ length: ROUNDS_PER_DAY }, (_, slot) => (
                    <TaskSlot
                      key={slot}
                      task={snapshot.completedTasks[slot] ?? null}
                      fallback={slot === todayDone ? 'pending' : 'empty'}
                    />
                  ))}
                </div>
              </li>,
              ...past.map((entry) => (
                <li key={entry.dayId} className={ROW_CLASS}>
                  <span className="text-sm text-content tabular-nums">
                    {formatDayId(entry.dayId)}
                  </span>
                  <span className="text-right text-sm font-bold text-season md:order-3">
                    {t('reward', { n: entry.seasonPoint })}
                  </span>
                  <div className="col-span-2 grid grid-cols-3 gap-2 md:order-2 md:col-span-1">
                    {Array.from({ length: ROUNDS_PER_DAY }, (_, slot) => (
                      <TaskSlot key={slot} task={entry.tasks[slot] ?? null} />
                    ))}
                  </div>
                </li>
              )),
            ]}
      </ul>
    </section>
  );
}
