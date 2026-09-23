import { Axe, Handshake, Skull, Swords, TowerControl, Zap, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { GAME_ICON } from '@/config/game-icons';
import { heroAsset, heroIconPath } from '@/config/heroes';

import type { TaskCandidate, TaskMetric } from '@/app/lib/daily-task';

// 与生涯数据、近期战绩共用同一个概念对同一个图标，见 docs/web/design-system.md「游戏图标」
const METRIC_ICON: Record<
  TaskMetric,
  { kind: 'dota'; src: string } | { kind: 'lucide'; Icon: LucideIcon }
> = {
  kills: { kind: 'lucide', Icon: Swords },
  assists: { kind: 'lucide', Icon: Handshake },
  last_hits: { kind: 'lucide', Icon: Axe },
  tower_kills: { kind: 'lucide', Icon: TowerControl },
  hero_damage: { kind: 'dota', src: GAME_ICON.heroDamage },
  healing: { kind: 'dota', src: GAME_ICON.healing },
  total_gold_earned: { kind: 'dota', src: GAME_ICON.gold },
  damage_taken: { kind: 'dota', src: GAME_ICON.damageTaken },
  stun_duration: { kind: 'lucide', Icon: Zap },
  roshan_kills: { kind: 'lucide', Icon: Skull },
};

// 通用任务与英雄任务共用同一个框：中性灰底、不再用每日任务青，那个色只留给入口图标
const BOX_CLASS =
  'flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-control';

/** 英雄任务出小地图头像，通用任务出指标图标——两种任务在列表里要一眼分得开 */
export default function TaskIcon({ task }: { task: TaskCandidate }) {
  const t = useTranslations('dailyTask');
  const hero = task.heroName ? heroAsset(task.heroName) : undefined;

  if (task.heroName && hero?.icon) {
    return (
      <span className={BOX_CLASS}>
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

  const entry = METRIC_ICON[task.metric];
  return (
    <span className={BOX_CLASS} title={t(`metric.${task.metric}`)}>
      {entry.kind === 'dota' ? (
        // eslint-disable-next-line @next/next/no-img-element -- 固定尺寸的本地小图，不需要 next/image 的裁剪与响应式
        <img src={entry.src} alt="" width={20} height={20} className="object-contain" />
      ) : (
        <entry.Icon className="size-4 text-content" strokeWidth={1.8} aria-hidden="true" />
      )}
    </span>
  );
}
