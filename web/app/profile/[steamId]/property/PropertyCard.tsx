'use client';

import { Minus, Plus } from 'lucide-react';
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
  valuePerCell,
  type PropertyDef,
} from '@/config/properties';

interface PropertyCardProps {
  def: PropertyDef;
  /** 接口里的当前等级，数据没到时为 null */
  level: number | null;
  /** 还没提交的档数 */
  pendingCells: number;
  /** 剩下的属性点还够不够再加一档 */
  canAdd: boolean;
  busy: boolean;
  onPendingChange: (cells: number) => void;
  onUpgrade: (targetLevel: number) => void;
}

type CellState = 'filled' | 'pending' | 'empty';

/** 浮层左对齐并且只在需要时渲染：留在原地会把窄屏撑出横向滚动条 */
const TOOLTIP_CLASS =
  'pointer-events-none absolute bottom-[calc(100%+8px)] z-10 rounded-md border border-line bg-panel-soft px-2.5 py-1.5 text-xs whitespace-nowrap text-content';

/** 按属性等级逐级取色，冰蓝过渡到勇士紫：只用一种紫，加满的页面就只剩黑和紫 */
const LEVEL_COLORS = ['#86c5f0', '#8cb3f0', '#949ff0', '#9e8cec', '#a67be8', '#a26ae2', '#9b5de0', '#8d4dd4'];

/** 升级按钮固定占一半宽：文字随暂存档数变化时，加减器和按钮都不跟着移动 */
const ACTION_CLASS = 'w-1/2 shrink-0 px-3 whitespace-nowrap';

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

/** 悬停或聚焦才出现的说明 */
function Hint({ label, tip }: { label: string; tip: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      tabIndex={0}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      className="relative inline-flex cursor-help items-center rounded-full bg-panel-soft px-2 py-0.5 text-xs text-muted"
    >
      {label}
      {open ? (
        <span role="tooltip" className={`${TOOLTIP_CLASS} left-0`}>
          {tip}
        </span>
      ) : null}
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
  canAdd,
  busy,
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
  const canStage = canAdd && targetFilled < def.barCells;

  const cells = Array.from({ length: def.barCells }, (_, index) => {
    const cell = index + 1;
    const state: CellState = cell <= filled ? 'filled' : cell <= targetFilled ? 'pending' : 'empty';
    return { cell, state, color: LEVEL_COLORS[cell * levelsPerCell(def) - 1] };
  });

  const hint =
    target > 0
      ? t('card.effectNote', { level: targetFilled, heroLevel: heroLevelForCell(def, targetFilled) })
      : t('card.effectEmpty');

  // 只写当前等级，暂存后的变化已经由进度条、数值和按钮文字表达
  const levelText = `${t('card.level', { level: filled, max: def.barCells })}${
    oneShot
      ? ''
      : def.levelPerStep > 1
        ? ` · ${t('card.stepCost', { cost: def.levelPerStep })}`
        : ` · ${t('card.perCell', { value: valuePerCell(def) })}`
  }`;

  return (
    <div className="card-container card-pad-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-[10px] bg-panel-soft ${current > 0 ? 'text-content' : 'text-muted'}`}
        >
          <def.Icon className="size-7" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-heading">{t(`names.${def.name}`)}</span>
            {def.group === 'scaling' ? <Hint label={t('card.scalingBadge')} tip={hint} /> : null}
            {def.group === 'skill' ? <Hint label={t('card.skillBadge')} tip={hint} /> : null}
          </div>
          <span className="text-xs text-muted">
            {known ? levelText : <Skeleton>{levelText}</Skeleton>}
          </span>
        </div>
        {/* 满级标签放数值上方：跟在名称后面时长名称会折行，同一排的进度条随之错位。两行合计不超过图标高，满级的卡不会变高 */}
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {full ? (
            <span className="rounded-full bg-season-soft px-2 text-xs leading-[18px] text-season">
              {t('card.full')}
            </span>
          ) : null}
          <div className="flex items-baseline gap-1.5">
            {!known ? (
              <span className="text-xl font-bold">
                <Skeleton />
              </span>
            ) : oneShot ? (
              <span className={`text-xl font-bold ${current > 0 ? 'text-content' : 'text-muted'}`}>
                {t(current > 0 ? 'card.owned' : 'card.notOwned')}
              </span>
            ) : (
              <>
                <span className="text-xl font-bold text-content">{valueText(def, current)}</span>
                {staged ? (
                  <>
                    <span className="text-xs text-muted">→</span>
                    <span className="text-xl font-bold text-season">{valueText(def, target)}</span>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 进度条只是把等级画出来，数值和等级都已经有文字，读屏不用再念一遍 */}
      <div aria-hidden="true" className="relative">
        <div className="flex gap-1">
          {cells.map(({ cell, state, color }) => (
            <span
              key={cell}
              onMouseEnter={() => setHoveredCell(cell)}
              onMouseLeave={() => setHoveredCell(null)}
              className="flex flex-1 cursor-help items-center py-1"
            >
              <span
                className={`h-2.5 flex-1 rounded-sm ${state === 'empty' ? 'bg-panel-soft' : ''}`}
                style={cellStyle(color, state, full)}
              />
            </span>
          ))}
        </div>
        {/* 浮层挂在整条进度条的中线上，挂在格子上的话两头会顶出卡片 */}
        {hoveredCell === null ? null : (
          <span className={`${TOOLTIP_CLASS} left-1/2 -translate-x-1/2`}>
            {t('card.cellTip', {
              cell: hoveredCell,
              heroLevel: heroLevelForCell(def, hoveredCell),
            })}
          </span>
        )}
      </div>

      {full ? (
        // 满级不留按钮，同高的一条让同一行的卡片仍然对齐
        <p className="flex min-h-11 items-center justify-center rounded-[7px] bg-panel-soft text-sm text-muted">
          {t('card.maxed')}
        </p>
      ) : oneShot ? (
        <div className="flex items-center justify-between gap-2.5">
          <span className="min-w-0 text-sm text-muted">
            {t('card.oneShotCost', { cost: PROPERTY_MAX_LEVEL })}
          </span>
          <button
            type="button"
            disabled={!canAdd || locked}
            onClick={() => onUpgrade(PROPERTY_MAX_LEVEL)}
            className={`btn-season ${ACTION_CLASS}`}
          >
            {canAdd || !known ? t('card.upgrade') : t('card.notEnough')}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex w-[136px] shrink-0 items-center overflow-hidden rounded-[7px] border border-line bg-control">
            <button
              type="button"
              aria-label={t('card.decrease')}
              disabled={!staged || locked}
              onClick={() => onPendingChange(pendingCells - 1)}
              className="flex size-11 items-center justify-center text-content transition-colors hover:bg-control-hover disabled:opacity-35 disabled:hover:bg-control"
            >
              <Minus className="size-4" />
            </button>
            <span className={`flex-1 text-center font-bold ${staged ? 'text-season' : 'text-muted'}`}>
              {staged ? `+${pendingCells}` : 0}
            </span>
            <button
              type="button"
              aria-label={t('card.increase')}
              disabled={!canStage || locked}
              onClick={() => onPendingChange(pendingCells + 1)}
              className="flex size-11 items-center justify-center text-content transition-colors hover:bg-control-hover disabled:opacity-35 disabled:hover:bg-control"
            >
              <Plus className="size-4" />
            </button>
          </div>
          {/* 还没调整时点升级只是先加一档，不直接扣点；灰色只留给点不了的情况 */}
          <button
            type="button"
            disabled={locked || (!staged && !canStage)}
            onClick={() => (staged ? onUpgrade(target) : onPendingChange(1))}
            className={`${staged || (known && !canStage) ? 'btn-season' : 'btn-season-outline'} ${ACTION_CLASS}`}
          >
            {staged
              ? t('card.upgradeTo', { level: targetFilled })
              : canStage || !known
                ? t('card.upgrade')
                : t('card.notEnough')}
          </button>
        </div>
      )}
    </div>
  );
}
