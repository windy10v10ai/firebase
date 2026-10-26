'use client';

import { Check, Hourglass, Minus, Plus, TrendingUp, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type CSSProperties } from 'react';

import Skeleton from '@/app/components/ui/skeleton';
import {
  PROPERTY_MAX_LEVEL,
  cellsFilled,
  formatPropertyValue,
  heroLevelForCell,
  isOneShot,
  levelsPerCell,
  stepsForCell,
  valuePerCell,
  type PropertyDef,
} from '@/config/properties';

interface PropertyCardProps {
  def: PropertyDef;
  /** 接口里的当前等级，数据没到时为 null */
  level: number | null;
  /** 还没提交的档数 */
  pendingCells: number;
  /** 扣掉全部待提交档数之后剩下的属性点，数据没到时为 null */
  usablePoints: number | null;
  busy: boolean;
  /** 别人看时只画等级，不放任何操作 */
  readOnly: boolean;
  onPendingChange: (cells: number) => void;
  onUpgrade: (targetLevel: number) => void;
}

type CellState = 'filled' | 'pending' | 'empty';

/** 浮层只在需要时渲染：留在原地会把窄屏撑出横向滚动条 */
const TOOLTIP_CLASS =
  'pointer-events-none absolute bottom-[calc(100%+8px)] z-10 rounded-md border border-line bg-panel-soft px-2.5 py-1.5 text-xs text-content';

/** 取进度条第一级的冰蓝：表示随等级增长，又不占用勇士紫、会员金和链接蓝 */
const HINT_CLASS =
  'inline-flex size-5 shrink-0 cursor-help items-center justify-center self-center rounded-full bg-[#86c5f0]/15 text-[#86c5f0]';

/** 按属性等级逐级取色，冰蓝过渡到勇士紫：只用一种紫，加满的页面就只剩黑和紫 */
const LEVEL_COLORS = [
  '#86c5f0',
  '#8cb3f0',
  '#949ff0',
  '#9e8cec',
  '#a67be8',
  '#a26ae2',
  '#9b5de0',
  '#8d4dd4',
];

/** 一次激活的属性没有中间档，整段进度条按八档的颜色渐变 */
const ONE_SHOT_GRADIENT = `linear-gradient(90deg, ${LEVEL_COLORS.join(', ')})`;
const ONE_SHOT_PENDING_GRADIENT = `linear-gradient(90deg, ${LEVEL_COLORS.map((color) => `${color}5c`).join(', ')})`;

/**
 * 控件另起一行时分左右两半，加减器在左半、按钮在右半，各自居中，按钮放宽好点但设上限；
 * 控件在右侧定宽时按钮宽度固定，升级、激活文字随状态变也不会推动加减器
 */
const CONTROLS_LAYOUT_CLASS =
  'grid w-full shrink-0 grid-cols-2 items-center gap-4 @xl:flex @xl:justify-end @xl:gap-2';
const ACTION_CLASS =
  'w-full max-w-40 justify-self-center px-1 whitespace-nowrap @xl:w-24 @xl:max-w-none @xl:shrink-0 lg:@xl:w-20';

/** 加减号是两个各自带描边的小按钮，底色比卡片浅一档，一眼看得出能按 */
const STEP_BUTTON_CLASS =
  'flex size-11 shrink-0 items-center justify-center rounded-[7px] border border-line-strong bg-panel-raised text-heading shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-[filter,background-color] enabled:hover:brightness-125 enabled:active:bg-panel-soft enabled:active:shadow-none enabled:active:brightness-100 disabled:border-line disabled:bg-transparent disabled:text-faint disabled:shadow-none lg:h-10 lg:w-[34px]';

/**
 * 横条够宽时控件放在右侧并定宽，各行进度条才一样长；按横条自身的宽度判断，不看屏幕：
 * 电脑两列时每条比平板单列还窄，长语言的名称放不下
 */
const CONTROLS_WIDTH_CLASS = '@xl:w-56 lg:@xl:w-[188px]';

function cellStyle(color: string, state: CellState, full: boolean): CSSProperties | undefined {
  if (state === 'filled') {
    return { backgroundColor: color, boxShadow: full ? `0 0 6px ${color}66` : undefined };
  }
  // 暂存的格子用同色半透明加描边，和已拥有的实色格区分
  if (state === 'pending') {
    return { backgroundColor: `${color}5c`, boxShadow: `inset 0 0 0 1px ${color}` };
  }
  return undefined;
}

function oneShotStyle(state: CellState, full: boolean): CSSProperties | undefined {
  const edge = LEVEL_COLORS[LEVEL_COLORS.length - 1];
  if (state === 'filled') {
    return {
      backgroundImage: ONE_SHOT_GRADIENT,
      boxShadow: full ? `0 0 6px ${edge}66` : undefined,
    };
  }
  if (state === 'pending') {
    return { backgroundImage: ONE_SHOT_PENDING_GRADIENT, boxShadow: `inset 0 0 0 1px ${edge}` };
  }
  return undefined;
}

/** 名称后的小图标，悬停或聚焦时给出这组属性的生效规则 */
function Hint({ Icon, tip }: { Icon: LucideIcon; tip: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className={HINT_CLASS}
    >
      <Icon className="size-3" strokeWidth={2.5} aria-hidden="true" />
      <span className="sr-only">{tip}</span>
      {/* 浮层挂在名称那一行上、与它同宽，文字折行也不会顶出卡片 */}
      {open ? (
        <span aria-hidden="true" role="tooltip" className={`${TOOLTIP_CLASS} inset-x-0`}>
          {tip}
        </span>
      ) : null}
    </span>
  );
}

/** 点选区比看得见的条高出一截，窄屏手指才点得准 */
const HIT_AREA_CLASS = 'after:absolute after:inset-x-0 after:-inset-y-2';

/** 进度条的一格，或一次激活属性的整段；还能选的画成按钮，其余只负责悬停提示 */
function BarSegment({
  pickable,
  empty,
  className,
  style,
  onEnter,
  onPick,
}: {
  pickable: boolean;
  empty: boolean;
  className: string;
  style: CSSProperties | undefined;
  onEnter: () => void;
  onPick: () => void;
}) {
  const base = `relative h-2.5 min-w-0 rounded-sm ${HIT_AREA_CLASS} ${empty ? 'bg-panel-soft' : ''} ${className}`;
  return pickable ? (
    <button
      type="button"
      tabIndex={-1}
      onMouseEnter={onEnter}
      onClick={onPick}
      className={`${base} hover:outline-1 hover:outline-line-strong`}
      style={style}
    />
  ) : (
    <span onMouseEnter={onEnter} className={`${base} cursor-help`} style={style} />
  );
}

function MaxedBadge({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`items-center gap-2 text-sm font-semibold whitespace-nowrap text-season-light ${className}`}
    >
      <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-season-strong/18">
        <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
      </span>
      {label}
    </span>
  );
}

/** 额外技能点的数值要带单位，单位随语言变，只能落在文案里 */
function useValueText() {
  const t = useTranslations('property');
  return (def: PropertyDef, level: number) => {
    const value = formatPropertyValue(def, level);
    return def.group === 'skill' ? t('card.skillValue', { value }) : value;
  };
}

export default function PropertyCard({
  def,
  level,
  pendingCells,
  usablePoints,
  busy,
  readOnly,
  onPendingChange,
  onUpgrade,
}: PropertyCardProps) {
  const t = useTranslations('property');
  const valueText = useValueText();
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const oneShot = isOneShot(def);
  const known = level !== null;
  const current = level ?? 0;
  // 数据没到时整张卡按未加点画出来，操作全部锁住
  const locked = busy || !known;
  const filled = cellsFilled(def, current);
  const target = current + pendingCells * def.levelPerStep;
  const targetFilled = cellsFilled(def, target);
  const full = known && current >= PROPERTY_MAX_LEVEL;
  const staged = pendingCells > 0;
  const canStage =
    usablePoints !== null && usablePoints >= def.levelPerStep && targetFilled < def.barCells;
  const pickable = !readOnly && !locked && !full;

  const cells = Array.from({ length: def.barCells }, (_, index) => {
    const cell = index + 1;
    const state: CellState = cell <= filled ? 'filled' : cell <= targetFilled ? 'pending' : 'empty';
    return { cell, state, color: LEVEL_COLORS[cell * levelsPerCell(def) - 1] };
  });

  const pickCell = (cell: number) =>
    onPendingChange(stepsForCell(def, current, pendingCells, cell, usablePoints ?? 0));

  const subText = oneShot
    ? t('card.oneShot')
    : def.levelPerStep > 1
      ? t('card.skillCost', { cost: def.levelPerStep })
      : t('card.perCell', { value: valuePerCell(def) });

  const tipText =
    hoveredCell === null
      ? null
      : oneShot
        ? t('card.oneShotTip')
        : t('card.cellTip', { cell: hoveredCell, heroLevel: heroLevelForCell(def, hoveredCell) });

  const borderClass = staged
    ? 'border-season-border'
    : full
      ? 'border-season-border/80'
      : 'border-line';
  const tileClass = full
    ? 'bg-season-strong/14 text-season-light'
    : `bg-panel-soft ${current > 0 ? 'text-content' : 'text-muted'}`;

  const name = t(`names.${def.name}`);

  return (
    // 别人看时没加过的属性压暗，加在哪一眼就能看出来
    <div
      className={`card-container card-pad-sm @container transition-colors ${borderClass} ${readOnly && known && current === 0 ? 'opacity-55' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 @xl:flex-nowrap @xl:gap-x-3.5">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] ${tileClass}`}
        >
          <def.Icon className="size-[22px]" strokeWidth={1.75} />
        </span>

        <div className="flex min-w-0 grow basis-[calc(100%-52px)] flex-col gap-2 @xl:basis-0">
          {/* 名称与小字各占一行、允许折行：英文、俄文的名称很长，截断后认不出是哪条属性 */}
          <div className="relative flex min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5">
                <span className="font-semibold text-heading">{name}</span>
                {def.group === 'scaling' ? (
                  <Hint Icon={TrendingUp} tip={t('card.scalingTip')} />
                ) : null}
                {def.group === 'skill' ? <Hint Icon={Hourglass} tip={t('card.skillTip')} /> : null}
              </div>
              <span className="block text-xs text-muted">
                {known ? subText : <Skeleton>{subText}</Skeleton>}
              </span>
            </div>
            <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap tabular-nums">
              {!known ? (
                <span className="font-bold">
                  <Skeleton />
                </span>
              ) : oneShot ? (
                staged ? (
                  <span className="font-bold text-season">{t('card.staged')}</span>
                ) : (
                  <span className={`font-bold ${current > 0 ? 'text-heading' : 'text-muted'}`}>
                    {t(current > 0 ? 'card.owned' : 'card.notOwned')}
                  </span>
                )
              ) : (
                <>
                  <span className={`font-bold ${current > 0 ? 'text-heading' : 'text-muted'}`}>
                    {valueText(def, current)}
                  </span>
                  {staged ? (
                    <>
                      <span className="text-xs text-muted">→</span>
                      <span className="font-bold text-season">{valueText(def, target)}</span>
                    </>
                  ) : null}
                </>
              )}
            </span>
          </div>

          {/* 进度条只是把等级画出来，数值和等级都已经有文字，读屏不用再念一遍；格子是点选的辅助入口，键盘用加减器 */}
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="relative min-w-0 flex-1"
              onMouseLeave={() => setHoveredCell(null)}
            >
              {oneShot ? (
                <BarSegment
                  pickable={pickable}
                  className="block w-full"
                  style={oneShotStyle(full ? 'filled' : staged ? 'pending' : 'empty', full)}
                  empty={!full && !staged}
                  onEnter={() => setHoveredCell(PROPERTY_MAX_LEVEL)}
                  onPick={() => pickCell(def.barCells)}
                />
              ) : (
                <div className="flex gap-[3px]">
                  {cells.map(({ cell, state, color }) => (
                    <BarSegment
                      key={cell}
                      pickable={pickable && cell > filled}
                      className="flex-1"
                      style={cellStyle(color, state, full)}
                      empty={state === 'empty'}
                      onEnter={() => setHoveredCell(cell)}
                      onPick={() => pickCell(cell)}
                    />
                  ))}
                </div>
              )}
              {/* 浮层挂在整条进度条的中线上，挂在格子上的话两头会顶出卡片 */}
              {tipText === null ? null : (
                <span className={`${TOOLTIP_CLASS} left-1/2 -translate-x-1/2 whitespace-nowrap`}>
                  {tipText}
                </span>
              )}
            </div>
          </div>
        </div>

        {readOnly ? null : full ? (
          // 满级不留按钮，但占着控件区的宽度，进度条才和别的行一样长；窄排法下不显示，紫边已经表明满级，进度条不用让位
          <div className={`hidden shrink-0 justify-center @xl:flex ${CONTROLS_WIDTH_CLASS}`}>
            <MaxedBadge label={t('card.maxed')} className="flex" />
          </div>
        ) : (
          <div className={`${CONTROLS_LAYOUT_CLASS} ${CONTROLS_WIDTH_CLASS}`}>
            {oneShot ? (
              <>
                <span className="min-w-0 justify-self-center text-center text-xs leading-snug text-muted @xl:flex-1 @xl:text-left">
                  {t('card.oneShotCost', { cost: PROPERTY_MAX_LEVEL })}
                </span>
                <button
                  type="button"
                  disabled={locked || (!staged && !canStage)}
                  onClick={() => (staged ? onUpgrade(PROPERTY_MAX_LEVEL) : onPendingChange(1))}
                  className={`${staged ? 'btn-season' : 'btn-season-outline'} ${ACTION_CLASS}`}
                >
                  {t('card.activate')}
                </button>
              </>
            ) : (
              <>
                <div className="flex shrink-0 items-center gap-1 justify-self-center">
                  <button
                    type="button"
                    aria-label={t('card.decrease')}
                    disabled={!staged || locked}
                    onClick={() => onPendingChange(pendingCells - 1)}
                    className={STEP_BUTTON_CLASS}
                  >
                    <Minus className="size-4" />
                  </button>
                  <span
                    className={`w-6 text-center font-bold tabular-nums ${staged ? 'text-season' : 'text-muted'}`}
                  >
                    {staged ? `+${pendingCells}` : 0}
                  </span>
                  <button
                    type="button"
                    aria-label={t('card.increase')}
                    disabled={!canStage || locked}
                    onClick={() => onPendingChange(pendingCells + 1)}
                    className={STEP_BUTTON_CLASS}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                {/* 还没选档数时点升级只是先选上一档，不扣点；选好后按钮变实心，再点才提交 */}
                <button
                  type="button"
                  disabled={locked || (!staged && !canStage)}
                  onClick={() => (staged ? onUpgrade(target) : onPendingChange(1))}
                  className={`${staged ? 'btn-season' : 'btn-season-outline'} ${ACTION_CLASS}`}
                >
                  {t('card.upgrade')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
