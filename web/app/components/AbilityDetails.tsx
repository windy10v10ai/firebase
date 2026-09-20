'use client';

import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';

import GameText from '@/app/components/GameText';

import type { AbilityDamageType, AbilityDetail, AbilityValueRow } from '@/config/awaken';

const DAMAGE_COLOR: Record<AbilityDamageType, string> = {
  physical: 'text-dota-physical',
  magical: 'text-dota-magical',
  pure: 'text-dota-pure',
};

const ROW_CLASS = 'text-[13px] leading-5';

interface AbilityDetailsProps {
  ability: AbilityDetail;
  /** 已按当前语言取好的描述 */
  desc: string;
  locale: 'zh' | 'en';
  /** 悬浮提示与详情弹窗只差描述和背景故事的字号 */
  variant: 'tooltip' | 'dialog';
}

/**
 * Dota 式技能块：属性、描述、数值、消耗、背景故事，块之间用分隔线隔开。
 * 返回平铺的块，间距由调用方的 flex 容器定。
 */
export default function AbilityDetails({ ability, desc, locale, variant }: AbilityDetailsProps) {
  const t = useTranslations('ability');

  const meta: [string, ReactNode][] = [];
  if (ability.behavior) {
    meta.push([t('behavior.label'), t(`behavior.${ability.behavior}`)]);
  }
  if (ability.targeting) {
    meta.push([t('targeting.label'), t(`targeting.${ability.targeting}`)]);
  }
  if (ability.damageType) {
    meta.push([
      t('damageType.label'),
      <span key="damage" className={DAMAGE_COLOR[ability.damageType]}>
        {t(`damageType.${ability.damageType}`)}
      </span>,
    ]);
  }
  if (ability.piercesImmunity) {
    meta.push([
      t('piercesImmunity.label'),
      <span key="immunity" className={ability.piercesImmunity === 'yes' ? 'text-success' : ''}>
        {t(`piercesImmunity.${ability.piercesImmunity}`)}
      </span>,
    ]);
  }
  if (ability.dispellable) {
    meta.push([
      t('dispellable.label'),
      <span key="dispel" className={ability.dispellable === 'soft' ? '' : 'text-danger'}>
        {t(`dispellable.${ability.dispellable}`)}
      </span>,
    ]);
  }

  const sections: ReactNode[] = [];
  if (meta.length) {
    sections.push(
      <div key="meta" className={`flex flex-col gap-0.5 ${ROW_CLASS}`}>
        {meta.map(([label, value]) => (
          <div key={label}>
            <Label text={label} />
            {value}
          </div>
        ))}
      </div>,
    );
  }
  sections.push(
    <p
      key="desc"
      className={`leading-[1.65] ${variant === 'dialog' ? 'text-[15px]' : 'text-[13px]'}`}
    >
      <GameText text={desc} />
    </p>,
  );
  if (ability.values.length) {
    sections.push(
      <div key="values" className={`flex flex-col gap-0.75 ${ROW_CLASS}`}>
        {ability.values.map((row) => (
          <ValueRow
            key={row.label.en}
            row={row}
            label={row.label[locale]}
            damageType={ability.damageType}
          />
        ))}
      </div>,
    );
  }
  if (ability.cooldown || ability.manaCost) {
    sections.push(
      <div key="cost" className={`flex flex-wrap gap-x-4.5 gap-y-1 ${ROW_CLASS}`}>
        {ability.cooldown ? (
          <span className="flex items-center gap-1.5" title={t('cooldown')}>
            <CooldownIcon label={t('cooldown')} />
            <Levels levels={ability.cooldown} />
          </span>
        ) : null}
        {ability.manaCost ? (
          <span className="flex items-center gap-1.5" title={t('manaCost')}>
            <ManaIcon label={t('manaCost')} />
            <Levels levels={ability.manaCost} />
          </span>
        ) : null}
      </div>,
    );
  }
  if (ability.lore) {
    sections.push(
      <p
        key="lore"
        className={`text-muted ${variant === 'dialog' ? 'text-[13px] leading-5' : 'text-xs leading-4.5'}`}
      >
        {ability.lore[locale]}
      </p>,
    );
  }

  return sections.map((section, index) => (
    <Fragment key={index}>
      {index > 0 ? <hr className="border-line" /> : null}
      {section}
    </Fragment>
  ));
}

/** 标签自带冒号；全角冒号本身带留白，半角冒号后补一个空隙 */
function Label({ text }: { text: string }) {
  return <span className={`text-muted ${text.endsWith('：') ? '' : 'me-1'}`}>{text}</span>;
}

function ValueRow({
  row,
  label,
  damageType,
}: {
  row: AbilityValueRow;
  label: string;
  damageType: AbilityDamageType | null;
}) {
  const t = useTranslations('ability');
  // 吃技能增强的伤害数值按伤害类型上色，与游戏提示框一致
  const color = row.spellAmp && damageType ? DAMAGE_COLOR[damageType] : 'text-heading';
  return (
    <div className="flex flex-wrap items-center">
      <Label text={label} />
      <span>
        <Levels levels={row.levels} percent={row.percent} className={color} />
      </span>
      {row.aoe ? <AoeIcon label={t('aoe')} /> : null}
    </div>
  );
}

function Levels({
  levels,
  percent = false,
  className = 'text-heading',
}: {
  levels: string[];
  percent?: boolean;
  className?: string;
}) {
  return levels.map((level, index) => (
    <Fragment key={index}>
      {index > 0 ? <span className="text-faint"> / </span> : null}
      <span className={`font-semibold ${className}`}>
        {level}
        {percent ? '%' : ''}
      </span>
    </Fragment>
  ));
}

function CooldownIcon({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0 text-content" role="img">
      <title>{label}</title>
      <circle cx="8" cy="8.5" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5.5V8.5L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ManaIcon({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-dota-mana" role="img">
      <title>{label}</title>
      <rect x="2" y="2" width="12" height="12" rx="2.5" fill="currentColor" />
      <rect x="4" y="4" width="8" height="3" rx="1.5" fill="white" opacity="0.35" />
    </svg>
  );
}

function AoeIcon({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" className="ms-1 size-3 shrink-0 text-dota-magical" role="img">
      <title>{label}</title>
      <circle cx="6" cy="6" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="6" r="1.5" fill="currentColor" />
    </svg>
  );
}
