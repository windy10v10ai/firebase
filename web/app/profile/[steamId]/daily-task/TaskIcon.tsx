import {
  Axe,
  Coins,
  Flame,
  Handshake,
  HeartPulse,
  ShieldHalf,
  Skull,
  Swords,
  TowerControl,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { heroAsset, heroIconPath } from '@/config/heroes';

import type { TaskCandidate, TaskMetric } from '@/app/lib/daily-task';

// 指标图标只表意，不承担颜色语义；功能色只上图标本身，见 docs/web/design-system.md「功能色」
const METRIC_ICON: Record<TaskMetric, LucideIcon> = {
  kills: Swords,
  assists: Handshake,
  last_hits: Axe,
  tower_kills: TowerControl,
  hero_damage: Flame,
  healing: HeartPulse,
  total_gold_earned: Coins,
  damage_taken: ShieldHalf,
  stun_duration: Zap,
  roshan_kills: Skull,
};

const BOX_CLASS = 'flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md';

/** 英雄任务出小地图头像，通用任务出指标图标——两种任务在列表里要一眼分得开 */
export default function TaskIcon({ task }: { task: TaskCandidate }) {
  const t = useTranslations('dailyTask');
  const hero = task.heroName ? heroAsset(task.heroName) : undefined;

  if (task.heroName && hero?.icon) {
    return (
      // 头像自带角色轮廓，底块只负责裁圆角，不上功能色
      <span className={`${BOX_CLASS} border border-line bg-control`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 32px 固定尺寸的本地图，不需要 next/image 的裁剪与响应式 */}
        <img
          src={heroIconPath(hero.icon)}
          alt=""
          width={28}
          height={28}
          className="size-full object-cover"
        />
      </span>
    );
  }

  const Icon = METRIC_ICON[task.metric];
  return (
    <span className={`${BOX_CLASS} bg-feature-daily-soft`} title={t(`metric.${task.metric}`)}>
      <Icon className="size-4 text-feature-daily" strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}
