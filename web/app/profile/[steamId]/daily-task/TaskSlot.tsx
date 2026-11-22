import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';

import Stars from './Stars';
import TaskIcon from './TaskIcon';

import type { TaskCandidate } from '@/app/lib/daily-task';

export type SlotFallback = 'pending' | 'empty' | 'loading';

// 固定最小高度，一天只完成一条时另外两格照样占位，行高不跳
const SLOT_CLASS = 'flex min-h-7 items-center gap-2';

/**
 * 一轮任务的槽位：图标、指标短名、星级，不写目标值。
 * `task` 为空时按 `fallback` 显示进行中、没完成的占位或加载骨架。
 */
export default function TaskSlot({
  task,
  fallback = 'empty',
}: {
  task: TaskCandidate | null;
  fallback?: SlotFallback;
}) {
  const t = useTranslations('dailyTask');

  if (!task) {
    if (fallback === 'loading') {
      return (
        <div className={SLOT_CLASS}>
          <span className="size-7 shrink-0 animate-pulse rounded-md bg-line" aria-hidden="true" />
          <Skeleton>击杀</Skeleton>
        </div>
      );
    }
    return fallback === 'pending' ? (
      <div className={`${SLOT_CLASS} text-sm text-feature-daily`}>{t('inProgress')}</div>
    ) : (
      <div className={`${SLOT_CLASS} text-faint`} aria-hidden="true">
        —
      </div>
    );
  }

  // 一行三个时窄屏放不下较长的短名，截断后可能读成另一个指标，所以竖排并允许折行
  return (
    <div className={SLOT_CLASS}>
      <TaskIcon task={task} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-2">
        <span className="text-xs leading-tight break-words hyphens-auto text-content md:truncate md:text-sm">
          {t(`metric.${task.metric}`)}
        </span>
        <Stars star={task.star} />
      </div>
    </div>
  );
}
