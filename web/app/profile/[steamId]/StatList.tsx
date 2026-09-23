import Skeleton from '@/app/components/ui/skeleton';

import type { ReactNode } from 'react';

export interface StatItem {
  key: string;
  label: ReactNode;
  /** 数据没到时为 null */
  value: string | null;
  /** 击杀绿、死亡红这类固定含义的覆盖色；不传就用默认字色 */
  valueClassName?: string;
}

/** 成对的名称与数值，个人主页的几个区块共用。分栏与否看所在卡片的宽度，不看视口 */
export default function StatList({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid gap-x-8 @sm:grid-cols-2">
      {items.map(({ key, label, value, valueClassName }) => (
        <div key={key} className="flex items-baseline justify-between gap-4 border-b border-line py-2">
          <dt className="flex items-center gap-1.5 text-muted">{label}</dt>
          <dd className={`font-medium tabular-nums ${valueClassName ?? 'text-content'}`}>
            {value ?? <Skeleton />}
          </dd>
        </div>
      ))}
    </dl>
  );
}
