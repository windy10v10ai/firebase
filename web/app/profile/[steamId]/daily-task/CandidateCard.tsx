import { useTranslations } from 'next-intl';

import Stars from './Stars';
import { useTaskText } from './task-text';
import TaskIcon from './TaskIcon';

import type { TaskCandidate } from '@/app/lib/daily-task';

/**
 * 本轮的一个候选任务：图标、文案与星级在左，奖励在右。
 * 网站不表示玩家在游戏内选了哪个——那是对局里的临时状态。
 */
export default function CandidateCard({ task }: { task: TaskCandidate }) {
  const t = useTranslations('dailyTask');
  const taskText = useTaskText();

  return (
    <li className="flex items-start gap-3 border-t border-line py-3">
      <TaskIcon task={task} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm leading-relaxed text-content">{taskText(task)}</p>
        <Stars star={task.star} />
      </div>
      <span className="text-sm font-bold whitespace-nowrap text-season">
        {t('reward', { n: task.rewardSeasonPoint })}
      </span>
    </li>
  );
}
