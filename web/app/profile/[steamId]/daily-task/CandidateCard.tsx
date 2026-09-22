import { useTranslations } from 'next-intl';

import Stars from './Stars';
import { useTaskText } from './task-text';
import TaskIcon from './TaskIcon';

import type { TaskCandidate } from '@/app/lib/daily-task';

/**
 * 本轮的一个候选任务，结构照游戏内的任务卡：头像与星级在第一行左边、奖励在右边，
 * 任务文案独占第二行。网站不表示玩家在游戏内选了哪个——那是对局里的临时状态。
 */
export default function CandidateCard({ task }: { task: TaskCandidate }) {
  const t = useTranslations('dailyTask');
  const taskText = useTaskText();

  return (
    <li className="box-pad flex flex-col gap-1.5 rounded-lg border border-line bg-control">
      <div className="flex items-center gap-2">
        <TaskIcon task={task} />
        <Stars star={task.star} />
        <span className="ml-auto text-sm font-bold text-season">
          {t('rewardFull', { n: task.rewardSeasonPoint })}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-content">{taskText(task)}</p>
    </li>
  );
}
