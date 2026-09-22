import { Check, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Button from '@/app/components/ui/button';
import Skeleton from '@/app/components/ui/skeleton';
import { ROUNDS_PER_DAY } from '@/config/daily-task';

import CandidateCard from './CandidateCard';
import TaskSlot from './TaskSlot';

import type { DailyTaskSnapshot } from '@/app/lib/daily-task';

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function RoundRing({ done }: { done: number | null }) {
  const t = useTranslations('dailyTask');
  const ratio = done === null ? 0 : Math.min(done, ROUNDS_PER_DAY) / ROUNDS_PER_DAY;

  return (
    <svg
      viewBox="0 0 120 120"
      className="size-20 shrink-0 md:size-24"
      role="img"
      aria-label={t('roundProgress', { done: done ?? 0, total: ROUNDS_PER_DAY })}
    >
      <circle
        cx="60"
        cy="60"
        r={RADIUS}
        fill="none"
        strokeWidth="11"
        className="stroke-panel-soft"
      />
      <circle
        cx="60"
        cy="60"
        r={RADIUS}
        fill="none"
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
        transform="rotate(-90 60 60)"
        className="stroke-feature-daily"
      />
      <text x="60" y="57" textAnchor="middle" className="fill-heading text-[26px] font-bold">
        {done ?? 0}
      </text>
      <text x="60" y="78" textAnchor="middle" className="fill-muted text-[13px]">
        {t('roundTotal', { total: ROUNDS_PER_DAY })}
      </text>
    </svg>
  );
}

interface TodayCardProps {
  snapshot: DailyTaskSnapshot | null;
  refreshing: boolean;
  refreshFailed: boolean;
  onRefresh: () => void;
}

/**
 * 今天：轮次进度与今日积分在上，当前这轮的三个任务加刷新按钮在中间，已完成的排在最下。
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
      <h2 className="text-lg font-bold text-heading">{t('today')}</h2>

      <div className="mt-4 flex items-center gap-4">
        <RoundRing done={doneCount} />
        <div className="min-w-0">
          <div className="text-xs text-muted">{t('todayPoint')}</div>
          <div className="text-2xl font-bold text-season">
            {snapshot ? t('reward', { n: snapshot.todaySeasonPoint }) : <Skeleton>+000</Skeleton>}
          </div>
        </div>
      </div>

      {allDone ? (
        <p className="mt-5 text-sm text-muted">{t('allDone', { total: ROUNDS_PER_DAY })}</p>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {round === null ? <Skeleton>第 0 轮任务</Skeleton> : t('round', { round })}
            </span>
            {/* 每轮只能刷一次，所以不显示剩余次数，用按钮自己的状态表达 */}
            <Button
              variant="secondary"
              className="px-4"
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

          <ul className="mt-2 grid gap-2">
            {snapshot
              ? snapshot.candidates.map((task) => <CandidateCard key={task.taskId} task={task} />)
              : // 没完成时必然是三条，骨架也放三条，数据到了高度不跳
                Array.from({ length: ROUNDS_PER_DAY }, (_, index) => (
                  <li
                    key={index}
                    className="box-pad flex flex-col gap-1.5 rounded-lg border border-line bg-control"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-7 shrink-0 animate-pulse rounded-md bg-line"
                        aria-hidden="true"
                      />
                      <Skeleton>★★★</Skeleton>
                      <span className="ml-auto text-sm">
                        <Skeleton>+000 勇士积分</Skeleton>
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">
                      <Skeleton>本局击杀英雄达到 000 次</Skeleton>
                    </p>
                  </li>
                ))}
          </ul>

          {snapshot && snapshot.candidates.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t('noCandidate')}</p>
          ) : null}
        </>
      )}

      <div className="mt-5 text-xs text-muted">{t('completed')}</div>
      <div className="mt-2 grid gap-2">
        {Array.from({ length: ROUNDS_PER_DAY }, (_, index) => (
          <TaskSlot key={index} task={snapshot?.completedTasks[index] ?? null} />
        ))}
      </div>
    </section>
  );
}
