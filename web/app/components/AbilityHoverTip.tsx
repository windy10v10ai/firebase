'use client';

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

/** 与 w-85 一致 */
const TOOLTIP_WIDTH = 340;
const TOOLTIP_GAP = 10;
const VIEWPORT_MARGIN = 8;
// 悬浮提示靠鼠标才成立，平板和手机按触控处理，与 lg: 断点同一口径
const HOVER_QUERY = '(min-width: 1024px) and (hover: hover)';

interface AbilityHoverTipProps {
  /** 被悬停的卡片或按钮，提示框属于它整体 */
  children: ReactNode;
  /** 标题块左侧的 44px 图标，调用方自己画 */
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  /** 标题块之下的技能块，通常是 AbilityDetails */
  content: ReactNode;
}

/**
 * 电脑档的技能悬浮提示：鼠标停在卡片上或键盘聚焦卡片时挂在卡片右侧，右边放不下翻到左边，底边出屏整体上移。
 * 规范见 docs/web/ability-tooltip.md 第 3、4 节。
 */
export default function AbilityHoverTip({
  children,
  icon,
  title,
  subtitle,
  content,
}: AbilityHoverTipProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipSide, setTipSide] = useState<'left' | 'right' | null>(null);

  const showTip = () => {
    const root = rootRef.current;
    if (!root || !window.matchMedia(HOVER_QUERY).matches) {
      return;
    }
    const room = window.innerWidth - root.getBoundingClientRect().right - TOOLTIP_GAP;
    setTipSide(room - VIEWPORT_MARGIN >= TOOLTIP_WIDTH ? 'right' : 'left');
  };

  // 高度要渲染出来才量得到：底边出屏就整体上移，箭头反向补偿，仍对着卡片上部
  useLayoutEffect(() => {
    const root = rootRef.current;
    const tip = tipRef.current;
    if (!tipSide || !root || !tip) {
      return;
    }
    const cardTop = root.getBoundingClientRect().top;
    const overflow = cardTop + tip.offsetHeight + VIEWPORT_MARGIN - window.innerHeight;
    const shift = Math.max(Math.min(0, -overflow), VIEWPORT_MARGIN - cardTop);
    tip.style.setProperty('--tip-shift', `${shift}px`);
  }, [tipSide]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') {
          showTip();
        }
      }}
      onPointerLeave={() => setTipSide(null)}
      onFocus={showTip}
      onBlur={() => setTipSide(null)}
    >
      {children}

      {tipSide ? (
        // 只是鼠标用户的快捷预览，读屏用户点开详情弹窗拿到的是同一份内容
        <div
          ref={tipRef}
          aria-hidden="true"
          className={`pointer-events-none absolute top-(--tip-shift) z-30 w-85 rounded-lg border border-line-strong bg-panel-soft text-content shadow-[0_18px_40px_-10px_rgba(0,0,0,0.85)] ${
            tipSide === 'right' ? 'left-[calc(100%+10px)]' : 'right-[calc(100%+10px)]'
          }`}
        >
          <span
            className={`absolute top-[calc(20px-var(--tip-shift))] size-2.75 rotate-45 border-line-strong bg-panel-raised ${
              tipSide === 'right' ? '-left-1.5 border-b border-l' : '-right-1.5 border-t border-r'
            }`}
          />
          <div className="flex items-center gap-3 rounded-t-lg border-b border-line bg-panel-raised px-3.5 py-3">
            {icon}
            <div className="flex min-w-0 flex-col gap-px">
              <div className="text-base leading-5.5 font-bold text-heading">{title}</div>
              <div className="text-xs leading-4.5 text-muted">{subtitle}</div>
            </div>
          </div>
          <div className="flex flex-col gap-3 px-3.5 pt-3 pb-3.5">{content}</div>
        </div>
      ) : null}
    </div>
  );
}
