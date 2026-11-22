import { ArrowRight, Check, Lock, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/app/components/ui/button';
import Skeleton from '@/app/components/ui/skeleton';
import { ROUNDS_PER_DAY } from '@/config/daily-task';

import CandidateCard from './CandidateCard';
import TaskIcon from './TaskIcon';

import type { DailyTaskSnapshot, TaskCandidate } from '@/app/lib/daily-task';

type RoundStatus = 'done' | 'current' | 'todo';

// 不画圆圈：空心圆配实心点像单选框，会让人以为要在这里选
const MARK = {
  done: { Icon: Check, className: 'text-success', strokeWidth: 2.6 },
  current: { Icon: ArrowRight, className: 'text-heading', strokeWidth: 2.6 },
  todo: { Icon: Lock, className: 'text-faint', strokeWidth: 2 },
} as const;

function RoundMark({ status }: { status: RoundStatus }) {
  const { Icon, className, strokeWidth } = MARK[status];
  return (
    <Icon
      className={`size-3.5 shrink-0 lg:size-[18px] ${className}`}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  );
}

/** 手机与平板是三格并排，电脑宽度改成竖排的一行一轮，所以同一个 `li` 带两套样式 */
const ITEM_CLASS = {
  done: 'border-line bg-control',
  current: 'border-line-strong bg-panel-raised',
  todo: 'border-line',
} as const;

const LABEL_CLASS = {
  done: 'text-muted',
  current: 'font-bold text-heading',
  todo: 'text-faint',
} as const;

function RoundItem({
  round,
  status,
  task,
  loading,
}: {
  round: number;
  status: RoundStatus;
  task: TaskCandidate | null;
  loading: boolean;
}) {
  const t = useTranslations('dailyTask');

  return (
    <li
      className={`flex min-h-[68px] flex-col gap-2 rounded-lg border p-2.5 lg:min-h-11 lg:flex-row lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:border-t lg:border-line lg:bg-transparent lg:p-0 ${ITEM_CLASS[status]}`}
    >
      <div className="flex items-center gap-2 lg:gap-3">
        <RoundMark status={status} />
        <span className={`text-sm whitespace-nowrap lg:min-w-11 ${LABEL_CLASS[status]}`}>
          {t('roundLabel', { round })}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm lg:gap-3">
        {loading ? (
          <Skeleton>击杀 ★★★</Skeleton>
        ) : task ? (
          <>
            <TaskIcon task={task} />
            <span className="min-w-0 text-xs leading-tight break-words hyphens-auto text-content lg:truncate lg:text-sm">
              {t(`metric.${task.metric}`)}
            </span>
            <span className="ml-auto hidden font-bold whitespace-nowrap text-season lg:block">
              {t('reward', { n: task.rewardSeasonPoint })}
            </span>
          </>
        ) : status === 'current' ? (
          <span className="text-heading">{t('inProgress')}</span>
        ) : (
          <span className="min-w-0 truncate text-faint">
            <span className="lg:hidden">{t('notStarted')}</span>
            <span className="hidden lg:inline">{t('unlockAfter', { round: round - 1 })}</span>
          </span>
        )}
      </div>
    </li>
  );
}

interface TodayCardProps {
  snapshot: DailyTaskSnapshot | null;
  refreshing: boolean;
  refreshFailed: boolean;
  onRefresh: () => void;
}

/**
 * 今天：三轮进度条加今日积分在上，当前这轮的三个候选任务与刷新按钮在下。
 * 玩家打开页面是想知道这一局该做什么，已完成的是结果、不是待办。
 */
export default function TodayCard({
  snapshot,
  refreshing,
  refreshFailed,
  onRefresh,
}: TodayCardProps) {
  const t = useTranslations('dailyTask');

  const doneCount = snapshot ? Math.min(snapshot.completedTasks.length, ROUNDS_PER_DAY) : null;
  const allDone = doneCount !== null && doneCount >= ROUNDS_PER_DAY;
  const round = doneCount === null ? null : Math.min(doneCount + 1, ROUNDS_PER_DAY);
  const canRefresh = snapshot !== null && snapshot.refreshRemaining > 0;

  return (
    <section className="card-container card-pad">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-heading">{t('today')}</h2>
        <div className="text-right">
          <div className="text-2xl leading-none font-bold text-season">
            {snapshot ? t('reward', { n: snapshot.todaySeasonPoint }) : <Skeleton>+000</Skeleton>}
          </div>
          <div className="mt-1 text-xs text-muted">{t('todayPoint')}</div>
        </div>
      </div>

      <ol
        className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-0"
        aria-label={t('roundProgress', { done: doneCount ?? 0, total: ROUNDS_PER_DAY })}
      >
        {Array.from({ length: ROUNDS_PER_DAY }, (_, index) => {
          const status: RoundStatus =
            doneCount === null || index > doneCount
              ? 'todo'
              : index < doneCount
                ? 'done'
                : 'current';
          return (
            <RoundItem
              key={index}
              round={index + 1}
              status={status}
              task={snapshot?.completedTasks[index] ?? null}
              loading={snapshot === null}
            />
          );
        })}
      </ol>

      {allDone ? (
        <p className="mt-4 text-sm text-muted">{t('allDone', { total: ROUNDS_PER_DAY })}</p>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between gap-3 lg:mt-3 lg:border-t lg:border-line lg:pt-4">
            <h3 className="text-[15px] font-bold text-heading">
              {round === null ? <Skeleton>第 0 轮任务</Skeleton> : t('round', { round })}
            </h3>
            {/* 每轮只能刷一次，所以不显示剩余次数，用按钮自己的状态表达 */}
            {/* 次要操作，不和本轮标题抢视线；窄屏只去掉边框，触控点击区不缩 */}
            <Button
              variant="ghost"
              className="-mr-2 gap-1.5 px-2 text-[13px] font-semibold lg:mr-0 lg:min-h-8 lg:border-line lg:px-3"
              loading={refreshing}
              disabled={!canRefresh}
              onClick={onRefresh}
            >
              {refreshing ? null : canRefresh ? (
                <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Check className="size-4 shrink-0" aria-hidden="true" />
              )}
              {refreshing ? t('refreshing') : canRefresh ? t('refresh') : t('refreshed')}
            </Button>
          </div>

          {refreshFailed ? (
            <p role="alert" className="mt-2 text-xs text-danger">
              {t('refreshFailed')}
            </p>
          ) : null}

          <ul className="mt-3">
            {snapshot
              ? snapshot.candidates.map((task) => <CandidateCard key={task.taskId} task={task} />)
              : // 没完成时必然是三条，骨架也放三条，数据到了高度不跳
                Array.from({ length: ROUNDS_PER_DAY }, (_, index) => (
                  <li key={index} className="flex items-start gap-3 border-t border-line py-3">
                    <span
                      className="size-7 shrink-0 animate-pulse rounded-md bg-line"
                      aria-hidden="true"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <p className="text-sm leading-relaxed">
                        <Skeleton>本局击杀英雄达到 000 次</Skeleton>
                      </p>
                      <Skeleton>★★★</Skeleton>
                    </div>
                    <span className="text-sm">
                      <Skeleton>+000</Skeleton>
                    </span>
                  </li>
                ))}
          </ul>

          {snapshot && snapshot.candidates.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t('noCandidate')}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
