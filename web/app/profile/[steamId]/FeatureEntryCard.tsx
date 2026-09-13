import { ChevronRight, type LucideIcon } from 'lucide-react';

interface FeatureEntryCardProps {
  Icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
}

// 属性、觉醒各自的页面还没上线（3a、3b），这里先只做视觉，不带跳转
export default function FeatureEntryCard({ Icon, title, description, badge }: FeatureEntryCardProps) {
  return (
    <div className="card-container flex items-center gap-4 p-4 sm:p-5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-season-soft">
        <Icon className="size-5 text-season" aria-hidden="true" />
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
      <ChevronRight className="size-5 shrink-0 text-season" aria-hidden="true" />
    </div>
  );
}
