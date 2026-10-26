import { useTranslations } from 'next-intl';

import Skeleton from '@/app/components/ui/skeleton';
import { levelProgress } from '@/app/lib/level-progress';

export interface LevelTileValues {
  level: number;
  currentLevelPoint: number;
  nextLevelPoint: number;
  usablePoint: number;
}

interface LevelTileProps {
  tone: 'season' | 'member';
  label: string;
  /** 数据没到时为 null */
  values: LevelTileValues | null;
  /** 请求失败：数值显示为横线，高度不变 */
  failed?: boolean;
}

const TONE = {
  season: {
    box: 'border-season-border bg-season-soft',
    text: 'text-season',
    bar: 'bg-season-strong',
  },
  member: {
    box: 'border-member-border bg-member-soft',
    text: 'text-member',
    bar: 'bg-member-strong',
  },
} as const;

/** 首页首屏面板里一套货币的等级、升级进度与可用积分 */
export default function LevelTile({ tone, label, values, failed = false }: LevelTileProps) {
  const t = useTranslations('home.summary');
  const style = TONE[tone];
  const { progress, remaining } = levelProgress(values);
  const placeholder = failed ? '—' : null;

  return (
    <div className={`box-pad flex h-full flex-col rounded-xl border ${style.box}`}>
      <span className="text-sm whitespace-nowrap text-content">{label}</span>
      <span
        className={`text-[28px] leading-tight font-extrabold tabular-nums md:text-[32px] ${style.text}`}
      >
        {values ? values.level : (placeholder ?? <Skeleton>00</Skeleton>)}
      </span>
      <div className="mt-1 h-1.5 rounded-full bg-glass">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${progress}%` }} />
      </div>
      <span className="mt-1.5 text-xs whitespace-nowrap text-muted">
        {values
          ? t('remainingToLevel', {
              level: values.level + 1,
              amount: remaining.toLocaleString(),
            })
          : (placeholder ?? <Skeleton>000000000</Skeleton>)}
      </span>
      {/* 示例卡里的块最窄，装不下「标签 + 数值」时数值换到下一行 */}
      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-xs whitespace-nowrap text-muted">{t('usablePoints')}</span>
        <span className={`text-sm font-bold tabular-nums ${style.text}`}>
          {values
            ? values.usablePoint.toLocaleString()
            : (placeholder ?? <Skeleton>0000</Skeleton>)}
        </span>
      </div>
    </div>
  );
}
