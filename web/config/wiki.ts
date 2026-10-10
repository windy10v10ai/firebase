import WIKI_DATA from './wiki-abilities.json';

import type { AbilityDetail } from './awaken';

/** 中英文必有；俄文缺译的条目在同步时已经落成英文 */
export interface WikiText {
  zh: string;
  en: string;
  ru: string;
}

export type WikiAbilityPool = 'active' | 'passive';

export interface WikiAbility {
  /** 内部技能名，名字与图标查 config/abilities.json */
  name: string;
  pool: WikiAbilityPool;
  /** 抽选档位，越高越难抽到 */
  tier: number;
  /** 完整描述，%占位符% 已在生成时换成真实数值 */
  desc: WikiText;
  ability: AbilityDetail;
}

/** 由 web/scripts/wiki-sync.mjs 生成；顺序照 game 抽选池的写法，同档内即游戏里的排列 */
export const WIKI_ABILITIES = WIKI_DATA.abilities as WikiAbility[];
