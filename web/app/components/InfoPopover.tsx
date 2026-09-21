'use client';

import { Info } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface InfoPopoverProps {
  label: string;
  children: React.ReactNode;
}

const VIEWPORT_MARGIN = 16;

/** 说明图标 + 弹层，点击展开，点击外部或 Esc 收起；首个这类组件，其余字段的说明可复用 */
export default function InfoPopover({ label, children }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
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
    const popoverWidth = popoverRef.current.offsetWidth;
    const idealLeft = rootRect.left + rootRect.width / 2 - popoverWidth / 2;
    const clampedLeft = Math.min(
      Math.max(idealLeft, VIEWPORT_MARGIN),
      window.innerWidth - popoverWidth - VIEWPORT_MARGIN,
    );
    setOffsetLeft(clampedLeft - rootRect.left);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-3.5 items-center justify-center text-muted transition-colors hover:text-heading"
      >
        <Info className="size-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={popoverRef}
          role="tooltip"
          style={{ left: offsetLeft }}
          className="absolute top-full z-10 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-[10px] border border-line-strong bg-panel-raised p-4 text-sm shadow-lg"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
