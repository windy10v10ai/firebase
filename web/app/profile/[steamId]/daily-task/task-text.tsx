'use client';

import { useLocale, useTranslations } from 'next-intl';

import { formatStatNumber } from '@/app/lib/format-stat-number';
import { heroAsset } from '@/config/daily-task';

import type { TaskCandidate } from '@/app/lib/daily-task';
import type { ReactNode } from 'react';

/** 三星封顶，与 api 的 STAR_REWARDS 一致 */
export const MAX_STAR = 3;

/**
 * 任务文案：英雄名与目标值都由这里拼，模板照搬游戏内的 dailytask_task_* 取值。
 * 目标值加粗，与游戏内一致。
 */
export function useTaskText() {
  const t = useTranslations('dailyTask');
  const locale = useLocale();

  return (task: TaskCandidate): ReactNode => {
    const target = formatStatNumber(task.target, locale === 'zh');
    const scope = task.scope === 'personal_hero' ? 'hero' : 'general';
    const hero = task.heroName ? heroAsset(task.heroName) : undefined;
    const heroLabel = hero ? (locale === 'zh' ? hero.zh : hero.en) : '';

    return t.rich(`task.${scope}.${task.metric}`, {
      target,
      hero: heroLabel,
      b: (chunks) => <b className="font-bold text-heading">{chunks}</b>,
    });
  };
}
