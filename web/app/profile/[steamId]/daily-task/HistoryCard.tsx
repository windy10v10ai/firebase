import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';
import { ROUNDS_PER_DAY } from '@/config/daily-task';

import TaskSlot from './TaskSlot';

import type { DailyTaskHistoryEntry } from '@/app/lib/daily-task';

const ROW_CLASS =
  'grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line px-3 py-2.5 md:grid-cols-[62px_1fr_76px] md:items-center';

/** `20260921` → `09-21`。只到月日，与游戏内一致 */
function formatDayId(dayId: string): string {
  return /^\d{8}$/.test(dayId) ? `${dayId.slice(4, 6)}-${dayId.slice(6, 8)}` : dayId;
}

/**
 * 30 天历史。日期不连续：没完成任务的日子根本不进历史，跳过的就是不出现，
 * 所以不做日历格子也不补空日，理由见 docs/design/web/phase-14-daily-task.md。
 */
export default function HistoryCard({ entries }: { entries: DailyTaskHistoryEntry[] | null }) {
  const t = useTranslations('dailyTask');

  return (
    <section className="card-container pt-4 pb-2">
      <h2 className="px-3 text-lg font-bold text-heading md:px-4">{t('history')}</h2>

      <div className="mt-3 hidden px-3 pb-2 text-xs text-muted md:grid md:grid-cols-[62px_1fr_76px] md:gap-3">
        <span>{t('columns.date')}</span>
        <span>{t('columns.tasks')}</span>
        <span className="text-right">{t('columns.points')}</span>
      </div>

      {entries === null ? (
        <ul className="mt-3 md:mt-0">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className={ROW_CLASS}>
              <Skeleton>00-00</Skeleton>
              <span className="text-right md:order-3">
                <Skeleton>+000</Skeleton>
              </span>
              <div className="col-span-2 grid grid-cols-3 gap-2 md:order-2 md:col-span-1">
                {Array.from({ length: ROUNDS_PER_DAY }, (_, slot) => (
                  <TaskSlot key={slot} task={null} layout="grid" />
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : entries.length === 0 ? (
        <p className="px-3 pt-2 pb-4 text-sm text-muted md:px-4">{t('historyEmpty')}</p>
      ) : (
        <ul className="mt-3 md:mt-0">
          {entries.map((entry) => (
            <li key={entry.dayId} className={ROW_CLASS}>
              <span className="text-sm text-content tabular-nums">{formatDayId(entry.dayId)}</span>
              <span className="text-right text-sm font-bold text-season md:order-3">
                {t('reward', { n: entry.seasonPoint })}
              </span>
              <div className="col-span-2 grid grid-cols-3 gap-2 md:order-2 md:col-span-1">
                {Array.from({ length: ROUNDS_PER_DAY }, (_, slot) => (
                  <TaskSlot key={slot} task={entry.tasks[slot] ?? null} layout="grid" />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
