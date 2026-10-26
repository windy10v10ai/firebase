import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import type { ComponentType } from 'react';

interface ActionCardProps {
  href: string;
  /** 站外链接：新标签页打开，用普通 <a> */
  external?: boolean;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** 功能色文字类，图标与底块同属一个功能 */
  iconClassName: string;
  /** 同功能的 -soft 底色类；不属于某个功能的用 bg-icon-tile */
  tileClassName: string;
  title: string;
  description: string;
  /** 写这张卡点进去做什么，手机上不显示 */
  capsule?: string;
  /** 胶囊放到说明下面，而不是文字与箭头之间；说明较长的卡用它 */
  capsuleBelow?: boolean;
  /** 悬停描边随归属：勇士、会员各自的色，其余用默认 */
  hoverClassName?: string;
  /** 首页暖色底上的半透明卡，透出背后的渐变；其余页面用实心卡 */
  translucent?: boolean;
}

/** 全站可点击卡片的统一模板，规格见 docs/web/design-system.md「可点击卡片」 */
export default function ActionCard({
  href,
  external = false,
  Icon,
  iconClassName,
  tileClassName,
  title,
  description,
  capsule,
  capsuleBelow = false,
  hoverClassName = 'card-hover',
  translucent = false,
}: ActionCardProps) {
  const className = [
    'group flex gap-3 md:gap-4 rounded-[10px] border card-pad-sm transition-colors',
    capsuleBelow ? 'items-start' : 'items-center',
    translucent
      ? 'border-home-card-border bg-home-card hover:bg-home-card-hover'
      : 'card-container',
    hoverClassName,
  ].join(' ');

  const capsuleClassName =
    'hidden h-8 items-center rounded-full border border-capsule-border px-3 text-[13px] whitespace-nowrap text-capsule-text md:inline-flex';

  const content = (
    <>
      <span className={`grid size-12 shrink-0 place-items-center rounded-lg ${tileClassName}`}>
        <Icon className={`size-6 ${iconClassName}`} strokeWidth={1.7} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className="font-bold text-heading">{title}</span>
        <span className="text-sm text-muted">{description}</span>
        {capsule && capsuleBelow ? (
          <span className={`${capsuleClassName} mt-2.5`}>{capsule}</span>
        ) : null}
      </span>
      {capsule && !capsuleBelow ? <span className={capsuleClassName}>{capsule}</span> : null}
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full border border-arrow-border transition-colors group-hover:border-line-strong ${capsuleBelow ? 'self-center' : ''}`}
      >
        <ChevronRight
          className="size-4 text-muted transition-colors group-hover:text-content"
          aria-hidden="true"
        />
      </span>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
