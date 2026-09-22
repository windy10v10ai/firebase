import { useTranslations } from 'next-intl';

import Stars from './Stars';
import TaskIcon from './TaskIcon';

import type { TaskCandidate } from '@/app/lib/daily-task';

// 空槽与已完成的槽同高，一天只完成一条时另外两格照样占位，见 docs/design/web/phase-14-daily-task.md
const BASE_CLASS = 'flex rounded-[7px] px-2 py-1.5';

// 一行三个时窄屏横着摆会把短名挤成省略号，改成竖排；单列的位置一律横排
const LAYOUT_CLASS = {
  row: 'min-h-11 items-center gap-2',
  grid: 'min-h-[76px] flex-col items-start gap-1 md:min-h-11 md:flex-row md:items-center md:gap-2',
} as const;

/**
 * 一轮任务的槽位：图标、指标短名、星级，不写目标值——与游戏内的历史记录一致。
 * `task` 为空表示这一轮没完成，渲染成虚线空位。
 */
export default function TaskSlot({
  task,
  layout = 'row',
}: {
  task: TaskCandidate | null;
  layout?: keyof typeof LAYOUT_CLASS;
}) {
  const t = useTranslations('dailyTask');
  const shape = `${BASE_CLASS} ${LAYOUT_CLASS[layout]}`;

  if (!task) {
    return <div className={`${shape} border border-dashed border-line/60`} aria-hidden="true" />;
  }

  return (
    <div className={`${shape} border border-line bg-control`}>
      <TaskIcon task={task} />
      <span className="w-full min-w-0 flex-1 truncate text-xs text-content">
        {t(`metric.${task.metric}`)}
      </span>
      <Stars star={task.star} />
    </div>
  );
}
