import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';
import { HISTORY_DAY_LIMIT } from '@/config/daily-task';

import type { DailyTaskHistoryEntry, DailyTaskSnapshot } from '@/app/lib/daily-task';

const ROW_CLASS = 'flex items-baseline justify-between gap-3 border-t border-line py-2 first:border-t-0';

/** 今天往前数满 `HISTORY_DAY_LIMIT` 个日历日的第一天，天号是定宽数字串，可以直接按字符串比较 */
function windowStartDayId(today: string): string {
  const date = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8))),
  );
  date.setUTCDate(date.getUTCDate() - (HISTORY_DAY_LIMIT - 1));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * 最近 30 天的总量。历史列表一行一天，滚到底才知道这个月打了多少，这块把三个数直接给出来。
 * 后端按条数保留历史，跳过的日子不占位，所以要先按日历窗口筛一遍再汇总；今天的进度也算在窗口里。
 */
export default function SummaryCard({ snapshot }: { snapshot: DailyTaskSnapshot | null }) {
  const t = useTranslations('dailyTask.summary');

  let entries: DailyTaskHistoryEntry[] | null = null;
  if (snapshot?.history) {
    const start = windowStartDayId(snapshot.dayId);
    const today: DailyTaskHistoryEntry = {
      dayId: snapshot.dayId,
      tasks: snapshot.completedTasks,
      seasonPoint: snapshot.todaySeasonPoint,
    };
    entries = [today, ...snapshot.history.filter((entry) => entry.dayId >= start)].filter(
      (entry) => entry.tasks.length > 0,
    );
  }

  const days = entries?.length ?? null;
  const tasks = entries?.reduce((sum, entry) => sum + entry.tasks.length, 0) ?? null;
  const points = entries?.reduce((sum, entry) => sum + entry.seasonPoint, 0) ?? null;

  return (
    <section className="card-container card-pad">
      <h2 className="mb-2 text-lg font-bold text-heading">{t('title', { days: HISTORY_DAY_LIMIT })}</h2>
      <dl>
        <div className={ROW_CLASS}>
          <dt className="text-sm text-muted">{t('days')}</dt>
          <dd className="font-bold text-heading">
            {days === null ? <Skeleton>00</Skeleton> : t('dayCount', { n: days })}
          </dd>
        </div>
        <div className={ROW_CLASS}>
          <dt className="text-sm text-muted">{t('tasks')}</dt>
          <dd className="font-bold text-heading">
            {tasks === null ? <Skeleton>00</Skeleton> : t('taskCount', { n: tasks })}
          </dd>
        </div>
        <div className={ROW_CLASS}>
          <dt className="text-sm text-muted">{t('points')}</dt>
          <dd className="font-bold text-season">
            {points === null ? <Skeleton>0,000</Skeleton> : points.toLocaleString()}
          </dd>
        </div>
      </dl>
    </section>
  );
}
