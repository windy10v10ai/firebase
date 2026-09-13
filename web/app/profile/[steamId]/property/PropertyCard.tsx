'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  PROPERTY_MAX_LEVEL,
  cellsFilled,
  formatPropertyValue,
  heroLevelForCell,
  isOneShot,
  valuePerCell,
  type PropertyDef,
} from '@/config/properties';

interface PropertyCardProps {
  def: PropertyDef;
  /** 接口里的当前等级 */
  level: number;
  /** 还没提交的档数 */
  pendingCells: number;
  /** 剩下的属性点还够不够再加一档 */
  canAdd: boolean;
  busy: boolean;
  onPendingChange: (cells: number) => void;
  onUpgrade: (targetLevel: number) => void;
}

/** 浮层左对齐并且只在需要时渲染：留在原地会把窄屏撑出横向滚动条 */
const TOOLTIP_CLASS =
  'pointer-events-none absolute bottom-[calc(100%+8px)] z-10 rounded-md border border-line bg-panel-soft px-2.5 py-1.5 text-xs whitespace-nowrap text-content';

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
  const filled = cellsFilled(def, level);
  const target = level + pendingCells * def.levelPerStep;
  const targetFilled = cellsFilled(def, target);
  const full = level >= PROPERTY_MAX_LEVEL;

  const cells = Array.from({ length: def.barCells }, (_, index) => {
    const cell = index + 1;
    const state = cell <= filled ? 'filled' : cell <= targetFilled ? 'pending' : 'empty';
    return { cell, state };
  });

  return (
    <div className="card-container flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel-soft text-muted">
          <def.Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-heading">{t(`names.${def.name}`)}</span>
            {full ? (
              <span className="rounded-full bg-season-soft px-2 py-0.5 text-xs text-season">
                {t('card.full')}
              </span>
            ) : null}
            {def.group === 'scaling' ? (
              <Hint
                label={t('card.scalingBadge')}
                tip={
                  target > 0
                    ? t('card.effectNote', {
                        level: targetFilled,
                        heroLevel: heroLevelForCell(def, targetFilled),
                      })
                    : t('card.effectEmpty')
                }
              />
            ) : null}
            {def.group === 'skill' ? (
              <Hint
                label={t('card.skillBadge')}
                tip={
                  target > 0
                    ? t('card.effectNote', {
                        level: targetFilled,
                        heroLevel: heroLevelForCell(def, targetFilled),
                      })
                    : t('card.effectEmpty')
                }
              />
            ) : null}
          </div>
          <span className="text-xs text-muted">
            {pendingCells > 0
              ? t('card.levelChange', { from: filled, to: targetFilled, max: def.barCells })
              : t('card.level', { level: filled, max: def.barCells })}
            {oneShot
              ? null
              : ` · ${t('card.perCell', { value: def.group === 'skill' ? t('card.skillValue', { value: valuePerCell(def) }) : valuePerCell(def) })}`}
            {!oneShot && def.levelPerStep > 1
              ? ` · ${t('card.perCellCost', { cost: def.levelPerStep })}`
              : null}
          </span>
        </div>
        <div className="flex shrink-0 items-baseline gap-1.5">
          {oneShot ? (
            <span className={`text-xl font-bold ${level > 0 ? 'text-content' : 'text-muted'}`}>
              {t(level > 0 ? 'card.owned' : 'card.notOwned')}
            </span>
          ) : (
            <>
              <span className="text-xl font-bold text-content">
                {valueText(def, level)}
              </span>
              {pendingCells > 0 ? (
                <>
                  <span className="text-xs text-muted">→</span>
                  <span className="text-xl font-bold text-season">
                    {valueText(def, target)}
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* 进度条只是把等级画出来，数值和等级都已经有文字，读屏不用再念一遍 */}
      <div aria-hidden="true" className="relative">
        <div className="flex gap-1">
          {cells.map(({ cell, state }) => (
            <span
              key={cell}
              onMouseEnter={() => setHoveredCell(cell)}
              onMouseLeave={() => setHoveredCell(null)}
              className="flex flex-1 cursor-help items-center py-1"
            >
              <span
                className={`h-2.5 flex-1 rounded-sm ${
                  state === 'filled'
                    ? 'bg-season-strong'
                    : state === 'pending'
                      ? 'bg-season-strong/40'
                      : 'bg-panel-soft'
                }`}
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

      {oneShot ? (
        <button
          type="button"
          disabled={full || !canAdd || busy}
          onClick={() => onUpgrade(PROPERTY_MAX_LEVEL)}
          className="btn-season w-full"
        >
          {full ? t('card.maxed') : t('card.unlock', { cost: PROPERTY_MAX_LEVEL })}
        </button>
      ) : (
        <div className="flex items-center gap-2.5">
          <div className="flex flex-1 items-center overflow-hidden rounded-[7px] border border-line bg-control">
            <button
              type="button"
              aria-label={t('card.decrease')}
              disabled={pendingCells === 0 || busy}
              onClick={() => onPendingChange(pendingCells - 1)}
              className="flex size-11 items-center justify-center text-content transition-colors hover:bg-control-hover disabled:opacity-35 disabled:hover:bg-control"
            >
              <Minus className="size-4" />
            </button>
            <span
              className={`flex-1 text-center font-bold ${pendingCells > 0 ? 'text-season' : 'text-muted'}`}
            >
              {pendingCells > 0 ? `+${pendingCells}` : 0}
            </span>
            <button
              type="button"
              aria-label={t('card.increase')}
              disabled={!canAdd || targetFilled >= def.barCells || busy}
              onClick={() => onPendingChange(pendingCells + 1)}
              className="flex size-11 items-center justify-center text-content transition-colors hover:bg-control-hover disabled:opacity-35 disabled:hover:bg-control"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <button
            type="button"
            disabled={pendingCells === 0 || busy}
            onClick={() => onUpgrade(target)}
            className="btn-season shrink-0"
          >
            {full
              ? t('card.maxed')
              : pendingCells > 0
                ? t('card.upgradeTo', { level: targetFilled })
                : t('card.upgrade')}
          </button>
        </div>
      )}
    </div>
  );
}
