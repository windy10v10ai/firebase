'use client';

import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/** 与 w-85、w-95 一致 */
const TOOLTIP_WIDTH = { site: 340, game: 380 };
const TOOLTIP_GAP = 10;
/** 与提示框的 max-h 一致 */
const VIEWPORT_MARGIN = 8;
// 悬浮提示靠鼠标才成立，平板和手机按触控处理，与 lg: 断点同一口径
const HOVER_QUERY = '(min-width: 1024px) and (hover: hover)';

// 钉住期间鼠标还要划过别的格子去读内容，其他格子的悬浮提示不能盖上来
let tipPinned = false;

interface AbilityHoverTipProps {
  /** 被悬停的卡片或按钮，提示框属于它整体 */
  children: ReactNode;
  /** 标题块左侧的 44px 图标，调用方自己画 */
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  /** 标题块之下的技能块，通常是 AbilityDetails */
  content: ReactNode;
  /** game 照游戏内物品提示配色，内容区不留内边距，由 ItemDetails 自己分块 */
  tone?: 'site' | 'game';
  /** 电脑档鼠标点击时钉住提示框，取代调用方的点击；点开后还有操作的卡片不要开 */
  pinnable?: boolean;
}

/**
 * 电脑档的技能悬浮提示：鼠标停在卡片上时挂在卡片右侧，右边放不下翻到左边，底边出屏整体上移，放不下的内容钉住后滚动。
 * 规范见 docs/web/ability-tooltip.md 第 3、4 节。
 */
export default function AbilityHoverTip({
  children,
  icon,
  title,
  subtitle,
  content,
  tone = 'site',
  pinnable = false,
}: AbilityHoverTipProps) {
  const game = tone === 'game';
  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [tipSide, setTipSide] = useState<'left' | 'right' | null>(null);
  const [pinned, setPinned] = useState(false);
  const [moreBelow, setMoreBelow] = useState(false);

  const placeTip = () => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const room = window.innerWidth - root.getBoundingClientRect().right - TOOLTIP_GAP;
    setTipSide(room - VIEWPORT_MARGIN >= TOOLTIP_WIDTH[tone] ? 'right' : 'left');
  };

  const updateMoreBelow = () => {
    const scroller = scrollerRef.current;
    if (scroller) {
      setMoreBelow(scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
    }
  };

  // 高度要渲染出来才量得到：底边出屏就整体上移，箭头反向补偿，仍对着卡片上部；说明晚于提示框到达时高度会变，要重新量
  useLayoutEffect(() => {
    const root = rootRef.current;
    const tip = tipRef.current;
    const body = contentRef.current;
    if (!tipSide || !root || !tip || !body) {
      return;
    }
    const measure = () => {
      const cardTop = root.getBoundingClientRect().top;
      const overflow = cardTop + tip.offsetHeight + VIEWPORT_MARGIN - window.innerHeight;
      const shift = Math.max(Math.min(0, -overflow), VIEWPORT_MARGIN - cardTop);
      tip.style.setProperty('--tip-shift', `${shift}px`);
      updateMoreBelow();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [tipSide]);

  useEffect(() => {
    if (!pinned) {
      return;
    }
    tipPinned = true;
    const close = () => {
      setPinned(false);
      setTipSide(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      tipPinned = false;
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pinned]);

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    // 在提示框里点击或拖选文字不算点卡片
    if (!(event.target as Element).closest('button')) {
      return;
    }
    // 回车触发的点击 detail 为 0，键盘用户看不到提示框，仍走调用方的详情弹窗
    if (pinnable && event.detail > 0 && window.matchMedia(HOVER_QUERY).matches) {
      event.stopPropagation();
      placeTip();
      setPinned(!pinned);
    } else {
      setPinned(false);
      setTipSide(null);
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onPointerEnter={(event) => {
        // 不跟随焦点：弹窗关闭时焦点会回到卡片，鼠标早已离开，提示框打开后就没有事件能关掉它
        if (event.pointerType === 'mouse' && !tipPinned && window.matchMedia(HOVER_QUERY).matches) {
          placeTip();
        }
      }}
      onPointerLeave={() => {
        if (!pinned) {
          setTipSide(null);
        }
      }}
      onClickCapture={onClickCapture}
    >
      {children}

      {tipSide ? (
        // 只是鼠标用户的快捷预览，读屏用户点开详情弹窗拿到的是同一份内容
        <div
          ref={tipRef}
          aria-hidden="true"
          className={`absolute top-(--tip-shift) z-30 flex max-h-[calc(100dvh-16px)] flex-col shadow-[0_18px_40px_-10px_rgba(0,0,0,0.85)] ${
            pinned ? 'pointer-events-auto' : 'pointer-events-none'
          } ${
            game
              ? 'w-95 rounded-md border border-game-line bg-game-panel text-game-text'
              : 'w-85 rounded-lg border border-line-strong bg-panel-soft text-content'
          } ${tipSide === 'right' ? 'left-[calc(100%+10px)]' : 'right-[calc(100%+10px)]'}`}
        >
          <span
            className={`absolute top-[calc(20px-var(--tip-shift))] size-2.75 rotate-45 ${
              game ? 'border-game-line bg-game-head' : 'border-line-strong bg-panel-raised'
            } ${
              tipSide === 'right' ? '-left-1.5 border-b border-l' : '-right-1.5 border-t border-r'
            }`}
          />
          {game ? (
            <div className="flex shrink-0 items-center gap-3 rounded-t-md bg-game-head px-3 py-2.5">
              {icon}
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="text-lg leading-6 font-bold text-heading">{title}</div>
                {subtitle ? <div className="text-[15px] leading-5">{subtitle}</div> : null}
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-3 rounded-t-lg border-b border-line bg-panel-raised px-3.5 py-3">
              {icon}
              <div className="flex min-w-0 flex-col gap-px">
                <div className="text-base leading-5.5 font-bold text-heading">{title}</div>
                <div className="text-xs leading-4.5 text-muted">{subtitle}</div>
              </div>
            </div>
          )}
          <div className="relative flex min-h-0 flex-col">
            <div
              ref={scrollerRef}
              onScroll={updateMoreBelow}
              className={`min-h-0 overscroll-contain ${game ? 'rounded-b-md' : 'rounded-b-lg'} ${
                pinned ? 'overflow-y-auto' : 'overflow-hidden'
              }`}
            >
              <div
                ref={contentRef}
                className={game ? '' : 'flex flex-col gap-3 px-3.5 pt-3 pb-3.5'}
              >
                {content}
              </div>
            </div>
            {/* 没到底就留着渐隐：滚动条自动隐藏的系统上，靠它看出下面还有内容 */}
            {moreBelow ? (
              <div
                className={`pointer-events-none absolute start-0 end-0 bottom-0 h-14 bg-linear-to-b from-transparent ${
                  game ? 'rounded-b-md to-game-panel' : 'rounded-b-lg to-panel-soft'
                }`}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
