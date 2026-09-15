'use client';

/* eslint-disable @next/next/no-img-element -- 觉醒的立绘与图标是本地静态文件、尺寸已经是目标尺寸，过一道 next/image 优化器只是白付 CPU；理由见 docs/design/web/phase-3b-awaken-page.md */

import { Check, ChevronDown, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type PointerEvent, useLayoutEffect, useRef, useState } from 'react';

import AbilityDetails from '@/app/components/AbilityDetails';
import GameText from '@/app/components/GameText';
import {
  AWAKEN_MEMBER_POINT_COST,
  AWAKEN_RANDOM_MEMBER_POINT_COST,
  AWAKEN_RANDOM_SEASON_POINT_COST,
  AWAKEN_SEASON_POINT_COST,
  awakenAssetPath,
} from '@/app/lib/awaken';

import type { AwakenHero } from '@/config/awaken';

// 展开时按渐隐高度回退滚动距离，接着被盖住的那几行往下读，不从已经看过的地方重来
const FADE_HEIGHT = 48;
// 抽屉只在手机档出现，与 md: 断点同一口径
const SHEET_QUERY = '(max-width: 767px)';
// 手指移动超过它才算拖动，轻点头部不会让抽屉跟着抖
const DRAG_START_DISTANCE = 6;
// 下拉不到这个距离就松手按回弹处理，免得碰一下就关
const DRAG_CLOSE_DISTANCE = 96;
// 与抽屉的 duration-200 一致，滑出屏幕后再真正关闭
const SHEET_CLOSE_MS = 200;

interface AwakenDialogProps {
  hero: AwakenHero | null;
  unlocked: boolean;
  /** 从随机候选进来的走半价，按钮上划掉原价 */
  fromRandom: boolean;
  busy: boolean;
  useableSeasonPoint: number;
  useableMemberPoint: number;
  onClose: () => void;
  onConfirm: (useMemberPoint: boolean) => void;
}

/**
 * 详情与付费合一。看清楚买的是什么、再选用哪种积分付，本来就是一件事。
 * 用原生 <dialog> 白拿焦点陷阱和 Esc 关闭，和属性页的重置弹窗同一套。
 * 付费按钮的位置不随技能说明长短变；说明放不下时电脑直接滚动，触屏先收起、点「详细」再滚动。理由见 docs/web/ability-tooltip.md。
 */
export default function AwakenDialog({
  hero,
  unlocked,
  fromRandom,
  busy,
  useableSeasonPoint,
  useableMemberPoint,
  onClose,
  onConfirm,
}: AwakenDialogProps) {
  const t = useTranslations('awaken.dialog');
  const locale = useLocale() === 'zh' ? 'zh' : 'en';
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startY: number; distance: number; active: boolean } | null>(
    null,
  );
  // 说明区下面还有没露出来的内容；收起、滚动中都用它决定渐隐
  const [moreBelow, setMoreBelow] = useState(false);
  // 记的是展开了哪个英雄，换英雄时自然回到收起，不用另写重置
  const [expandedHero, setExpandedHero] = useState<string | null>(null);
  const expanded = hero !== null && expandedHero === hero.heroName;
  const collapsed = moreBelow && !expanded;

  // 先打开再量高度，两步都在绘制前完成，收起态第一帧就是对的
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (hero && !dialog.open) {
      dialog.showModal();
    } else if (!hero && dialog.open) {
      dialog.close();
    }
    if (!hero) {
      // 下拉关闭时抽屉停在屏幕外，不清掉下次打开会从那个位置出现
      dialog.style.translate = '';
      dialog.style.transition = '';
    }
  }, [hero]);

  const updateMoreBelow = () => {
    const body = bodyRef.current;
    if (body) {
      setMoreBelow(body.scrollTop + body.clientHeight < body.scrollHeight - 1);
    }
  };

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!body || !content) {
      return;
    }
    // 说明区是同一个元素，换英雄时不归零会停在上一个英雄滚到的位置
    body.scrollTop = 0;
    updateMoreBelow();
    // 窗口高度、字体加载都会改变放不放得下
    const observer = new ResizeObserver(updateMoreBelow);
    observer.observe(body);
    observer.observe(content);
    return () => observer.disconnect();
  }, [hero]);

  const expand = () => {
    const body = bodyRef.current;
    if (!hero || !body) {
      return;
    }
    const top = Math.max(0, body.clientHeight - FADE_HEIGHT * 2);
    setExpandedHero(hero.heroName);
    // 「详细」按钮点完就消失，焦点交给说明区，键盘用户可以接着用方向键滚
    body.focus({ preventScroll: true });
    body.scrollTo({
      top,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  const onDragStart = (event: PointerEvent<HTMLDivElement>) => {
    if (busy || !window.matchMedia(SHEET_QUERY).matches) {
      return;
    }
    drag.current = { pointerId: event.pointerId, startY: event.clientY, distance: 0, active: false };
  };

  const onDragMove = (event: PointerEvent<HTMLDivElement>) => {
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

  const onDragEnd = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const dialog = ref.current;
    drag.current = null;
    if (!current?.active || !dialog) {
      return;
    }
    dialog.style.transition = '';
    if (event.type === 'pointerup' && current.distance > DRAG_CLOSE_DISTANCE) {
      dialog.style.translate = '0 100%';
      window.setTimeout(onClose, SHEET_CLOSE_MS);
    } else {
      dialog.style.translate = '';
    }
  };

  const seasonCost = fromRandom ? AWAKEN_RANDOM_SEASON_POINT_COST : AWAKEN_SEASON_POINT_COST;
  const memberCost = fromRandom ? AWAKEN_RANDOM_MEMBER_POINT_COST : AWAKEN_MEMBER_POINT_COST;
  const seasonShort = seasonCost - useableSeasonPoint;
  const memberShort = memberCost - useableMemberPoint;

  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(event) => {
        // 点遮罩关闭：事件落在 dialog 本身而不是里面的内容时才算点在遮罩上
        if (event.target === ref.current) {
          onClose();
        }
      }}
      // 手机是贴底的抽屉，按钮落在拇指区；平板起居中且统一高度，换英雄时按钮不挪位置
      className="card-container m-0 mt-auto max-h-[calc(100dvh-3rem)] w-full max-w-none rounded-t-[14px] rounded-b-none border-b-0 p-0 text-content transition-[translate] duration-200 ease-out backdrop:bg-black/60 open:flex open:flex-col starting:open:translate-y-full md:m-auto md:h-[min(40rem,calc(100dvh-4rem))] md:max-h-none md:w-[min(28rem,calc(100vw-2rem))] md:rounded-[10px] md:border-b md:transition-none md:starting:open:translate-y-0"
    >
      {hero ? (
        <div className="card-pad flex min-h-0 flex-1 flex-col gap-4.5 pt-6 lg:pt-8">
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

          {/* 下拉关闭只认头部连同上方的横杠区域，说明区展开后的滚动不会被当成下拉 */}
          <div
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            className="-mt-6 flex touch-none items-start gap-4 pt-6 pe-9 md:mt-0 md:touch-auto md:pt-0 lg:pe-6"
          >
            {hero.icon ? (
              <img
                src={awakenAssetPath(hero.icon)}
                alt=""
                width={96}
                height={96}
                draggable={false}
                className="size-16 shrink-0 rounded-md border border-heading/20"
              />
            ) : null}
            <div className="min-w-0">
              <div className="text-sm text-muted">{hero.name[locale]}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <h2 className="text-lg leading-snug font-bold">
                  <GameText text={hero.title[locale]} />
                </h2>
                {/* 状态跟着技能名一起被看到；底部状态条在付费按钮的位置，两处各管一件事 */}
                {unlocked ? (
                  <span className="inline-flex h-5.5 items-center gap-1 rounded border border-member-border bg-member-soft px-2 text-xs font-bold whitespace-nowrap text-member-strong">
                    <Check className="size-3" aria-hidden="true" />
                    {t('alreadyUnlocked')}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* 电脑档让说明区伸进右侧留白，滚动条贴着弹窗边缘；-me-8 与 card-pad 的 lg:p-8 对应 */}
          <div className="relative flex min-h-0 flex-1 flex-col lg:-me-8">
            <div
              ref={bodyRef}
              tabIndex={-1}
              onScroll={updateMoreBelow}
              // 电脑有滚轮，直接滚比多点一次「详细」省事；触屏第一眼不出滚动条
              className={`min-h-0 flex-1 overscroll-contain outline-none lg:overflow-y-auto lg:pe-8 ${
                expanded ? 'overflow-y-auto' : 'overflow-hidden'
              }`}
            >
              <div ref={contentRef} className="flex flex-col gap-4.5">
                <AbilityDetails
                  ability={hero.ability}
                  desc={hero.desc[locale]}
                  locale={locale}
                  variant="dialog"
                />
              </div>
            </div>
            {/* 没滚到底就一直留着渐隐：滚动条自动隐藏的系统上，靠它看出下面还有内容 */}
            {moreBelow ? (
              <div
                aria-hidden="true"
                style={{ height: FADE_HEIGHT }}
                className="pointer-events-none absolute start-0 end-0 bottom-0 bg-linear-to-b from-transparent to-panel lg:end-8"
              />
            ) : null}
          </div>

          {collapsed ? (
            <button
              type="button"
              onClick={expand}
              className="link-inline -mt-2.5 inline-flex min-h-8 items-center gap-1 self-start text-sm font-bold lg:hidden"
            >
              {t('more')}
              <ChevronDown className="size-4" aria-hidden="true" />
            </button>
          ) : null}

          <hr className="border-line" />

          {unlocked ? (
            <p className="flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-member-soft text-sm font-bold text-member-strong lg:min-h-10">
              <Check className="size-4" aria-hidden="true" />
              {t('alreadyUnlocked')}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="text-sm">{t('question')}</p>
              <button
                type="button"
                disabled={busy || seasonShort > 0}
                onClick={() => onConfirm(false)}
                className="btn-season w-full"
              >
                {/* 读屏只读实际价格，划掉的原价是给眼睛看的 */}
                {fromRandom ? (
                  <s aria-hidden="true" className="font-semibold opacity-60">
                    {AWAKEN_SEASON_POINT_COST}
                  </s>
                ) : null}
                {t('useBattle', { cost: seasonCost })}
              </button>
              {seasonShort > 0 ? (
                <p className="text-sm text-muted">
                  {t('battleShort', {
                    have: useableSeasonPoint.toLocaleString(),
                    need: seasonShort.toLocaleString(),
                  })}
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy || memberShort > 0}
                onClick={() => onConfirm(true)}
                className="btn-member w-full"
              >
                {fromRandom ? (
                  <s aria-hidden="true" className="font-semibold opacity-60">
                    {AWAKEN_MEMBER_POINT_COST}
                  </s>
                ) : null}
                {t('useMember', { cost: memberCost })}
              </button>
              {memberShort > 0 ? (
                <p className="text-sm text-muted">
                  {t('memberShort', {
                    have: useableMemberPoint.toLocaleString(),
                    need: memberShort.toLocaleString(),
                  })}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
