'use client';

import { useTranslations } from 'next-intl';

import { AoeIcon, Label, Levels, useAbilityMeta } from '@/app/components/AbilityDetails';
import GameText from '@/app/components/GameText';
import { type AbilityLocale, pickText } from '@/app/lib/ability-text';

import type { AbilityDetail } from '@/config/awaken';
import type { ReactNode } from 'react';

// 物品说明的段落标题里只有被动有固定前缀；主动、使用、开关之外还有「流星」这类自起名字的主动段
const PASSIVE_TITLE = /^(被动|passive|пассивн)/i;

interface DescSection {
  /** null 表示说明开头没有标题的那一段 */
  title: string | null;
  body: string;
  active: boolean;
}

const trimBreaks = (text: string) => text.replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, '');

/** 按 <h1> 把说明切成「主动：xx」「被动：xx」几段 */
function splitSections(desc: string): DescSection[] {
  const parts = desc.split(/<h1>([\s\S]*?)<\/h1>/i);
  const sections: DescSection[] = [];
  const lead = trimBreaks(parts[0]);
  if (lead) {
    sections.push({ title: null, body: lead, active: false });
  }
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i];
    const plain = title.replace(/<[^>]+>/g, '').trim();
    sections.push({
      title,
      body: trimBreaks(parts[i + 1] ?? ''),
      active: !PASSIVE_TITLE.test(plain),
    });
  }
  return sections;
}

const SIZE = {
  tooltip: {
    text: 'text-[13px] leading-5',
    stats: 'text-sm leading-5.5',
    pad: 'px-3',
    section: 'mx-1.5 mb-1.5',
    lore: 'text-xs leading-4.5',
  },
  dialog: {
    text: 'text-sm leading-5.5',
    stats: 'text-[15px] leading-6',
    pad: 'px-4 md:px-4.5',
    section: 'mx-2 mb-2 md:mx-2.5 md:mb-2.5',
    lore: 'text-[13px] leading-5',
  },
};

interface ItemDetailsProps {
  ability: AbilityDetail;
  /** 已按当前语言取好的描述 */
  desc: string;
  locale: AbilityLocale;
  variant: 'tooltip' | 'dialog';
}

/**
 * 游戏内物品提示的样式：属性行、加成、主动与被动分块、背景故事。
 * 魔法消耗与冷却挂在第一个主动段的标题条上，没有主动段时挂在第一个有标题的段上。
 * 配色与规格见 docs/web/ability-tooltip.md。
 */
export default function ItemDetails({ ability, desc, locale, variant }: ItemDetailsProps) {
  const t = useTranslations('ability');
  const meta = useAbilityMeta(ability);
  const size = SIZE[variant];
  const sections = splitSections(desc);
  const firstActive = sections.findIndex((section) => section.title !== null && section.active);
  const costIndex =
    firstActive >= 0 ? firstActive : sections.findIndex((section) => section.title !== null);
  const cost =
    ability.cooldown || ability.manaCost ? (
      <span className="flex shrink-0 items-center gap-3 font-bold text-heading">
        {ability.manaCost ? (
          <span className="flex items-center gap-1.25" title={t('manaCost')}>
            <span
              role="img"
              aria-label={t('manaCost')}
              className="size-3.5 rounded-[3px] bg-dota-mana"
            />
            <Levels levels={ability.manaCost} />
          </span>
        ) : null}
        {ability.cooldown ? (
          <span className="flex items-center gap-1.25" title={t('cooldown')}>
            <span
              role="img"
              aria-label={t('cooldown')}
              className="size-3.5 rounded-[3px] bg-linear-135 from-content from-50% to-muted to-50%"
            />
            <Levels levels={ability.cooldown} />
          </span>
        ) : null}
      </span>
    ) : null;
  const signed = ability.values.filter((row) => row.sign);
  const unsigned = ability.values.filter((row) => !row.sign);

  return (
    <div className={`flex flex-col ${size.text}`}>
      {meta.length ? (
        <div className={`border-t border-game-divider py-2 text-game-label ${size.pad}`}>
          {meta.map(([label, value]) => (
            <div key={label}>
              <Label text={label} />
              {value}
            </div>
          ))}
        </div>
      ) : null}
      {ability.values.length || (cost && costIndex < 0) ? (
        <div className={`border-t border-game-divider pt-2 pb-2.5 ${size.stats} ${size.pad}`}>
          {signed.map((row) => (
            <div key={row.label.en}>
              <span className="me-1 text-game-label">{row.sign}</span>
              <Levels levels={row.levels} percent={row.percent} className="text-heading" />{' '}
              <GameText text={pickText(row.label, locale)} />
            </div>
          ))}
          {unsigned.map((row) => (
            <div key={row.label.en} className="flex flex-wrap items-center">
              <Label text={pickText(row.label, locale)} />
              <Levels levels={row.levels} percent={row.percent} className="text-heading" />
              {row.aoe ? <AoeIcon label={t('aoe')} /> : null}
            </div>
          ))}
          {/* 说明没有分段时，消耗与冷却没有标题条可挂，放在加成下面 */}
          {costIndex < 0 ? <div className="mt-1">{cost}</div> : null}
        </div>
      ) : null}
      {sections.length ? (
        <div className={meta.length || ability.values.length ? '' : 'pt-1.5'}>
          {sections.map((section, index) => (
            <Section
              key={index}
              section={section}
              cost={index === costIndex ? cost : null}
              margin={size.section}
            />
          ))}
        </div>
      ) : null}
      {ability.lore ? (
        <p
          className={`border-t border-game-divider bg-game-lore py-2.5 text-game-lore-text ${size.lore} ${size.pad}`}
        >
          {pickText(ability.lore, locale)}
        </p>
      ) : null}
    </div>
  );
}

function Section({
  section,
  cost,
  margin,
}: {
  section: DescSection;
  cost: ReactNode;
  margin: string;
}) {
  const tone = section.active
    ? { head: 'bg-game-active-head text-heading', body: 'bg-game-active text-game-active-text' }
    : { head: 'bg-game-passive-head text-heading', body: 'bg-game-passive text-game-text' };
  return (
    <section className={`overflow-hidden rounded-[3px] ${margin}`}>
      {section.title !== null ? (
        <h3
          className={`flex items-center justify-between gap-2.5 px-2.5 py-1.5 font-semibold ${tone.head}`}
        >
          <span className="min-w-0">
            <GameText text={section.title} />
          </span>
          {cost}
        </h3>
      ) : null}
      {section.body ? (
        <p className={`px-2.5 pt-2 pb-2.5 [&_b]:text-white ${tone.body}`}>
          <GameText text={section.body} />
        </p>
      ) : null}
    </section>
  );
}
