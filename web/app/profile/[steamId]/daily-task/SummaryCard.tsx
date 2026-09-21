import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';
import { HISTORY_DAY_LIMIT } from '@/config/daily-task';

import type { DailyTaskSnapshot } from '@/app/lib/daily-task';

const ROW_CLASS = 'flex items-baseline justify-between gap-3 border-t border-line py-2 first:border-t-0';

/**
 * 最近 30 天的总量。历史列表一行一天，滚到底才知道这个月打了多少，这块把三个数直接给出来。
 * 三个数由前端从历史算：接口不返回汇总，天数取历史条目数（一天只会有一条记录）。
 */
export default function SummaryCard({ snapshot }: { snapshot: DailyTaskSnapshot | null }) {
  const t = useTranslations('dailyTask.summary');
  const history = snapshot?.history ?? null;

  const days = history?.length ?? null;
  const tasks = history?.reduce((sum, entry) => sum + entry.tasks.length, 0) ?? null;
  const points = history?.reduce((sum, entry) => sum + entry.seasonPoint, 0) ?? null;

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
