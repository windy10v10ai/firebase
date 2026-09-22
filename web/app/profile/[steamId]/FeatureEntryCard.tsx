import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import type { ReactNode } from 'react';

// 功能色只上图标与图标底块，箭头与描边保持中性，见 docs/design/web/phase-12-color-system.md
const TONE_CLASS = {
  property: { box: 'bg-feature-property-soft', icon: 'text-feature-property' },
  awaken: { box: 'bg-feature-awaken-soft', icon: 'text-feature-awaken' },
  dailyTask: { box: 'bg-feature-daily-soft', icon: 'text-feature-daily' },
  leaderboard: { box: 'bg-season-soft', icon: 'text-season' },
} as const;

interface FeatureEntryCardProps {
  tone: keyof typeof TONE_CLASS;
  Icon: LucideIcon;
  title: string;
  badge?: ReactNode;
  href: string;
}

export default function FeatureEntryCard({ tone, Icon, title, badge, href }: FeatureEntryCardProps) {
  return (
    <Link href={href} className="card-container card-pad-sm card-hover flex min-w-0 items-center gap-3 md:gap-4">
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] md:size-10 ${TONE_CLASS[tone].box}`}
      >
        <Icon className={`size-5 ${TONE_CLASS[tone].icon}`} aria-hidden="true" />
      </div>
      {/* 标签放标题下方：俄语的标题与标签并排时，哪一档宽度都放不下 */}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="max-w-full truncate font-medium text-heading">{title}</span>
        {badge ? (
          <span className="max-w-full truncate rounded-full bg-panel-soft px-2 py-0.5 text-xs text-content">
            {badge}
          </span>
        ) : null}
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}
