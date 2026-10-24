import { describe, expect, it } from 'vitest';

import DETAILS from '@/config/match-item-details.json';
import MATCH_ITEMS from '@/config/match-items.json';
import WIKI_DETAILS from '@/config/wiki-item-details.json';
import WIKI_ITEMS from '@/config/wiki-items.json';

import { matchItemEntries } from './match-items';

describe('战绩物品收录', () => {
  it('覆盖普通成装、中立、附魔及死亡退化物，排除配方和基础配件', () => {
    const entries = new Map(matchItemEntries('zh').map((entry) => [entry.key, entry]));
    for (const name of [
      'item_black_king_bar',
      'item_satanic',
      'item_blink',
      'item_mirror_shield',
      'item_enhancement_boundless',
      'item_divine_regalia_broken',
      'item_eldwurms_edda',
    ])
      expect(entries.has(name)).toBe(true);
    for (const name of [
      'item_branches',
      'item_circlet',
      'item_soul_ring_1',
      'item_eternal_shroud_ultra',
    ]) {
      expect(entries.has(name)).toBe(false);
    }
    expect([...entries.keys()].some((name) => name.startsWith('item_recipe_'))).toBe(false);
    expect(entries.get('item_divine_regalia_broken')).toMatchObject({ label: '失节华冠', tag: '' });
    expect(entries.get('item_divine_regalia_broken')).not.toHaveProperty('price');
    expect(entries.get('item_black_king_bar')?.price).toBeGreaterThan(0);
  });

  it('每件物品有独立说明，且与百科说明不重叠', () => {
    const details = DETAILS as Record<
      string,
      { desc: { en: string }; ability: { values: unknown[] } }
    >;
    const wiki = WIKI_DETAILS as Record<string, unknown>;
    for (const { name } of MATCH_ITEMS.items) {
      expect(wiki[name], name).toBeUndefined();
      expect(details[name], name).toBeDefined();
      expect(Boolean(details[name].desc.en || details[name].ability.values.length), name).toBe(
        true,
      );
    }
    expect(DETAILS.item_divine_regalia_broken.desc.en).toContain('You have died');
    expect(DETAILS.item_divine_regalia_broken).not.toEqual(DETAILS.item_divine_regalia);
  });
});

describe('game 指定提交的物品同步', () => {
  it('删除法师泳衣并同步兽化盾价格和说明', () => {
    expect(WIKI_ITEMS.shop.some(({ name }) => name === 'item_eternal_shroud_ultra')).toBe(false);
    expect(WIKI_ITEMS.shop.find(({ name }) => name === 'item_beast_shield')?.price).toBe(42200);
    for (const desc of Object.values(WIKI_DETAILS.item_beast_shield.desc)) {
      expect(desc).not.toMatch(/游泳|Swimming/);
    }
  });

  it('六脉神剑保留新施法属性，移除减速抗性', () => {
    const rows = WIKI_DETAILS.item_sacred_six_vein.ability.values;
    expect(rows.some(({ label }) => label.zh === '减速抗性')).toBe(false);
    expect(rows.find(({ label }) => label.zh === '施法速度加成')?.levels).toEqual(['50']);
  });
});
