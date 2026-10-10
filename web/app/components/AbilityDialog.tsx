'use client';

import { ChevronDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react';

// 滑过这一点就算知道能滑了，提示不再出现；再小容易被点按时的手指抖动触发
const HINT_DISMISS_DISTANCE = 8;
// 抽屉只在手机档出现，与 md: 断点同一口径
const SHEET_QUERY = '(max-width: 767px)';
// 手指移动超过它才算拖动，轻点头部不会让抽屉跟着抖
const DRAG_START_DISTANCE = 6;
// 下拉不到这个距离就松手按回弹处理，免得碰一下就关
const DRAG_CLOSE_DISTANCE = 96;
// 单手时拇指常按在抽屉上沿外侧一点，这一段遮罩也算抽屉头部
const DRAG_EDGE_OUTSET = 24;
// 与抽屉的 duration-200 一致，滑出屏幕后再真正关闭
const SHEET_CLOSE_MS = 200;

interface AbilityDialogProps {
  /** 换一个值就算重新打开：说明区回到顶部、滑动提示重新出现；null 为关闭 */
  openKey: string | null;
  onClose: () => void;
  /** 有请求在飞时锁住关闭 */
  busy?: boolean;
  /** 弹窗头部：图标、技能名与状态 */
  header: ReactNode;
  /** 可滚动的说明区，通常是 AbilityDetails */
  body: ReactNode;
  /** 固定在底部的操作区，如付费按钮；有它时平板起弹窗统一高度 */
  footer?: ReactNode;
}

/**
 * 技能详情弹窗：手机是贴底抽屉，可从头部下拉关闭；平板起居中。
 * 用原生 <dialog> 白拿焦点陷阱和 Esc 关闭。说明放不下时直接滚动，触屏在底部渐隐里提示可以滑。
 * 规范见 docs/web/ability-tooltip.md 第 3、4 节。
 */
export default function AbilityDialog({
  openKey,
  onClose,
  busy = false,
  header,
  body,
  footer,
}: AbilityDialogProps) {
  const t = useTranslations('ability.dialog');
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startY: number;
    distance: number;
    active: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  // 说明区下面还有没露出来的内容；渐隐和滑动提示都看它
  const [moreBelow, setMoreBelow] = useState(false);
  // 提示只教一次：滑过就不再出现，滑回顶部也不回来，免得一直压着最后一行
  const [hintDismissed, setHintDismissed] = useState(false);

  // 先打开再量高度，两步都在绘制前完成，渐隐和提示第一帧就是对的
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (openKey && !dialog.open) {
      dialog.showModal();
    } else if (!openKey && dialog.open) {
      dialog.close();
    }
    if (!openKey) {
      // 下拉关闭时抽屉停在屏幕外，不清掉下次打开会从那个位置出现
      dialog.style.translate = '';
      dialog.style.transition = '';
    }
  }, [openKey]);

  const updateMoreBelow = () => {
    const scroller = bodyRef.current;
    if (scroller) {
      setMoreBelow(scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
    }
  };

  useLayoutEffect(() => {
    const scroller = bodyRef.current;
    const content = contentRef.current;
    if (!scroller || !content) {
      return;
    }
    // 说明区是同一个元素，换技能时不归零会停在上一个技能滚到的位置
    scroller.scrollTop = 0;
    // 关掉重开或换技能都算新的一次打开，提示重新出现
    setHintDismissed(false);
    updateMoreBelow();
    // 窗口高度、字体加载都会改变放不放得下
    const observer = new ResizeObserver(updateMoreBelow);
    observer.observe(scroller);
    observer.observe(content);
    return () => observer.disconnect();
  }, [openKey]);

  // 拖动开始后拦下触摸滑动：浏览器一接管滑动就发 pointercancel 打断拖动，遮罩上又设不了 touch-action
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    const onTouchMove = (event: TouchEvent) => {
      if (drag.current) {
        event.preventDefault();
      }
    };
    dialog.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => dialog.removeEventListener('touchmove', onTouchMove);
  }, []);

  const onDragStart = (event: PointerEvent<HTMLDialogElement>) => {
    suppressClick.current = false;
    const dialog = ref.current;
    const head = headerRef.current;
    if (busy || !dialog || !head || !window.matchMedia(SHEET_QUERY).matches) {
      return;
    }
    const target = event.target as Node;
    // 按在遮罩上时事件落在 dialog 本身；只认抽屉上沿外那一段，其余遮罩只能点着关闭
    const top = dialog.getBoundingClientRect().top;
    const onEdge =
      target === dialog && event.clientY < top && event.clientY >= top - DRAG_EDGE_OUTSET;
    if (!onEdge && !head.contains(target)) {
      return;
    }
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      distance: 0,
      active: false,
    };
  };

  const onDragMove = (event: PointerEvent<HTMLDialogElement>) => {
    const current = drag.current;
    const dialog = ref.current;
    if (!current || current.pointerId !== event.pointerId || !dialog) {
      return;
    }
    const distance = Math.max(0, event.clientY - current.startY);
    if (!current.active) {
      if (distance < DRAG_START_DISTANCE) {
        return;
      }
      current.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      // 跟手期间关掉过渡，否则抽屉会落在手指后面
      dialog.style.transition = 'none';
    }
    current.distance = distance;
    dialog.style.translate = `0 ${distance}px`;
  };

  const onDragEnd = (event: PointerEvent<HTMLDialogElement>) => {
    const current = drag.current;
    const dialog = ref.current;
    drag.current = null;
    if (!current?.active || !dialog) {
      return;
    }
    // 拖过之后松手还会补发一次 click，从遮罩起拖时会被当成点遮罩关闭
    suppressClick.current = true;
    dialog.style.transition = '';
    if (event.type === 'pointerup' && current.distance > DRAG_CLOSE_DISTANCE) {
      dialog.style.translate = '0 100%';
      window.setTimeout(onClose, SHEET_CLOSE_MS);
    } else {
      dialog.style.translate = '';
    }
  };

  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        // 点遮罩关闭：事件落在 dialog 本身而不是里面的内容时才算点在遮罩上
        if (event.target === ref.current) {
          onClose();
        }
      }}
      // 抽屉上沿外那一段遮罩也能拖，手势挂在 dialog 上，按下的位置决定算不算拖动
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      // 手机是贴底的抽屉，按钮落在拇指区；有操作区时平板起统一高度，换技能时按钮不挪位置
      className={`card-container m-0 mt-auto max-h-[calc(100dvh-3rem)] w-full max-w-none rounded-t-[14px] rounded-b-none border-b-0 p-0 text-content transition-[translate] duration-200 ease-out backdrop:bg-black/60 open:flex open:flex-col starting:open:translate-y-full md:m-auto md:w-[min(28rem,calc(100vw-2rem))] md:rounded-[10px] md:border-b md:transition-none md:starting:open:translate-y-0 ${
        footer
          ? 'md:h-[min(40rem,calc(100dvh-4rem))] md:max-h-none'
          : 'md:max-h-[min(40rem,calc(100dvh-4rem))]'
      }`}
    >
      {openKey ? (
        // 手机抽屉的高度随内容定，伸缩基准要按内容算：基准写成 0% 时 iOS Safari 当成 0 高，整张抽屉只剩内边距那一条
        <div className="card-pad flex min-h-0 flex-auto flex-col gap-4.5 pt-6 lg:pt-8">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong md:hidden"
          />
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label={t('close')}
            className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-[7px] text-muted transition-colors hover:bg-panel-soft hover:text-heading md:top-3 md:right-3 lg:top-4 lg:right-4 lg:size-9"
          >
            <X className="size-5" aria-hidden="true" />
          </button>

          {/* 下拉关闭认头部整条：左右到抽屉边，往下带上与说明区之间的空隙；说明区不参与，展开后的滚动不会被当成下拉 */}
          <div
            ref={headerRef}
            className="-mx-4 -mt-6 -mb-4.5 flex touch-none items-start gap-4 ps-4 pe-13 pt-6 pb-4.5 md:mx-0 md:mt-0 md:mb-0 md:touch-auto md:ps-0 md:pe-9 md:pt-0 md:pb-0 lg:pe-6"
          >
            {header}
          </div>

          {/* 电脑档让说明区伸进右侧留白，滚动条贴着弹窗边缘；-me-8 与 card-pad 的 lg:p-8 对应 */}
          <div className="relative flex min-h-0 flex-auto flex-col lg:-me-8">
            <div
              ref={bodyRef}
              tabIndex={-1}
              onScroll={(event) => {
                updateMoreBelow();
                if (event.currentTarget.scrollTop > HINT_DISMISS_DISTANCE) {
                  setHintDismissed(true);
                }
              }}
              className="min-h-0 flex-auto overflow-y-auto overscroll-contain outline-none lg:pe-8"
            >
              <div ref={contentRef} className="flex flex-col gap-4.5">
                {body}
              </div>
            </div>
            {/* 没滚到底就一直留着渐隐：滚动条自动隐藏的系统上，靠它看出下面还有内容 */}
            {moreBelow ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute start-0 end-0 bottom-0 h-12 bg-linear-to-b from-transparent to-panel lg:end-8"
              />
            ) : null}
            {/* 触屏的滚动条平时藏着，光有渐隐看不出能滑；电脑档有滚轮，不提示。文案不写方向：写「向下滑」有人会往下拉，拉到头部就关掉了抽屉 */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute start-0 end-0 bottom-0.5 flex items-center justify-center gap-0.5 text-xs leading-4.5 font-medium text-muted transition-opacity duration-200 lg:hidden ${
                moreBelow && !hintDismissed ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {t('scrollHint')}
              <ChevronDown className="size-4 motion-safe:animate-scroll-hint" />
            </div>
          </div>

          {footer ? (
            <>
              <hr className="border-line" />
              {footer}
            </>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
