'use client';

import { Info } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface InfoPopoverProps {
  label: string;
  children: React.ReactNode;
  /** 换掉默认的说明图标，让表头图标、缩写列名自己当触发元素 */
  trigger?: React.ReactNode;
  /** 加在触发元素上，用来把命中区撑满整格 */
  className?: string;
  /** 一两个词的短提示，弹层按内容收宽 */
  compact?: boolean;
}

const VIEWPORT_MARGIN = 16;
/** 触屏上 mouseenter 会跟着点击一起触发，开了又被 click 关掉，所以只在真有鼠标时接管悬停 */
function canHover(): boolean {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

const DEFAULT_TRIGGER_CLASS =
  'inline-flex size-3.5 items-center justify-center text-muted transition-colors hover:text-heading';

/**
 * 说明图标 + 弹层。有鼠标时悬停即展开，触屏靠点击，点击外部或 Esc 收起。
 * 站内的说明提示都走这一个组件，不另写原生 title，理由见 docs/web/design-system.md「提示与说明」。
 */
export default function InfoPopover({
  label,
  children,
  trigger,
  className,
  compact = false,
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // 弹层固定宽度，触发图标离屏幕边缘太近时居中会把内容顶出视口，开合时量一次实际空间夹住偏移
  useLayoutEffect(() => {
    if (!open || !rootRef.current || !popoverRef.current) {
      return;
    }
    const rootRect = rootRef.current.getBoundingClientRect();
    // 触发元素可能撑满整格而内容只占一角，对齐图标本身，否则提示会飘到离它很远的地方
    const anchor = triggerRef.current?.firstElementChild ?? rootRef.current;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverWidth = popoverRef.current.offsetWidth;
    const idealLeft = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
    const clampedLeft = Math.min(
      Math.max(idealLeft, VIEWPORT_MARGIN),
      window.innerWidth - popoverWidth - VIEWPORT_MARGIN,
    );
    setOffsetLeft(clampedLeft - rootRect.left);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative flex"
      onMouseEnter={() => canHover() && setOpen(true)}
      onMouseLeave={() => canHover() && setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={className ?? DEFAULT_TRIGGER_CLASS}
      >
        {trigger ?? <Info className="size-3.5" aria-hidden="true" />}
      </button>
      {open ? (
        <div
          ref={popoverRef}
          role="tooltip"
          style={{ left: offsetLeft }}
          className={`absolute top-full z-20 mt-2 max-w-[calc(100vw-2rem)] rounded-[10px] border border-line-strong bg-panel-raised shadow-lg ${
            compact
              ? 'w-max px-2.5 py-1.5 text-xs whitespace-nowrap text-content'
              : 'w-72 p-4 text-sm'
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
