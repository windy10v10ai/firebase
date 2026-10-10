import WIKI_ABILITY_DATA from './wiki-abilities.json';
import WIKI_ITEM_DATA from './wiki-items.json';

import type { AbilityDetail } from './awaken';

/** 中英文必有；俄文缺译的条目在同步时已经落成英文 */
export interface WikiText {
  zh: string;
  en: string;
  ru: string;
}

export interface WikiEntryData<Group extends string = string> {
  /** 内部名，名字与图标查 config/abilities.json 或 items.json */
  name: string;
  /** 页面上的分区；物品不分区，全是 all */
  group: Group;
  /** 抽选档位 1–5，越高越难抽到 */
  tier: number;
  /** 完整描述，%占位符% 已在生成时换成真实数值；纯加属性的物品为空串 */
  desc: WikiText;
  ability: AbilityDetail;
}

/** 由 web/scripts/wiki-sync.mjs 生成；顺序照 game 抽选池的写法，同档内即游戏里的排列 */
export const WIKI_ABILITIES = WIKI_ABILITY_DATA.abilities as WikiEntryData<'active' | 'passive'>[];
export const WIKI_ITEMS = WIKI_ITEM_DATA.items as WikiEntryData<'all'>[];
