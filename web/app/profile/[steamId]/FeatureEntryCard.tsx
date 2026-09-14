import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import type { ReactNode } from 'react';

// 功能色只上图标与图标底块，箭头与描边保持中性，见 docs/design/web/phase-12-color-system.md
const TONE_CLASS = {
  property: { box: 'bg-feature-property-soft', icon: 'text-feature-property' },
  awaken: { box: 'bg-feature-awaken-soft', icon: 'text-feature-awaken' },
} as const;

interface FeatureEntryCardProps {
  tone: keyof typeof TONE_CLASS;
  Icon: LucideIcon;
  title: string;
  description: string;
  badge?: ReactNode;
  href: string;
}

export default function FeatureEntryCard({
  tone,
  Icon,
  title,
  description,
  badge,
  href,
}: FeatureEntryCardProps) {
  return (
    <Link href={href} className="card-container card-pad-sm card-hover flex items-center gap-4">
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-[10px] ${TONE_CLASS[tone].box}`}>
        <Icon className={`size-5 ${TONE_CLASS[tone].icon}`} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-heading">{title}</div>
        <div className="text-sm text-muted">{description}</div>
      </div>
      {badge ? (
        <span className="shrink-0 rounded-full bg-panel-soft px-3 py-1 text-sm text-content">
          {badge}
        </span>
      ) : null}
      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}
