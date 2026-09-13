import { ChevronRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

interface FeatureEntryCardProps {
  Icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
  href?: string;
}

// 觉醒（3b）还没有页面，没有 href 时只做视觉，不带跳转
export default function FeatureEntryCard({
  Icon,
  title,
  description,
  badge,
  href,
}: FeatureEntryCardProps) {
  const body = (
    <>
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
    </>
  );

  const className = 'card-container flex items-center gap-4 p-4 sm:p-5';

  if (!href) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Link href={href} className={`${className} transition-colors hover:border-season`}>
      {body}
    </Link>
  );
}
