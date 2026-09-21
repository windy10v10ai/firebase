import { useTranslations } from 'next-intl';

import Stars from './Stars';
import { useTaskText } from './task-text';
import TaskIcon from './TaskIcon';

import type { TaskCandidate } from '@/app/lib/daily-task';

/**
 * 本轮的一个候选任务。星级与奖励钉在右上角，文案在下面换行，
 * 位置不随文案长短移动。网站不表示玩家在游戏内选了哪个——那是对局里的临时状态。
 */
export default function CandidateCard({ task }: { task: TaskCandidate }) {
  const t = useTranslations('dailyTask');
  const taskText = useTaskText();

  return (
    <li className="box-pad flex gap-2.5 rounded-lg border border-line bg-control">
      <TaskIcon task={task} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-end gap-2.5">
          <Stars star={task.star} />
          <span className="text-sm font-bold text-season">
            {t('reward', { n: task.rewardSeasonPoint })}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-content">{taskText(task)}</p>
      </div>
    </li>
  );
}
