import WIKI_ABILITY_DATA from './wiki-abilities.json';
import WIKI_ITEM_DATA from './wiki-items.json';

import type { AbilityDetail } from './awaken';

/** 中英文必有；俄文缺译的条目在同步时已经落成英文 */
export interface WikiText {
  zh: string;
  en: string;
  ru: string;
}

/** 提示框与详情弹窗要的说明，另成一个包按需加载，见 app/components/WikiDetail.tsx */
export interface WikiDetail {
  /** 完整描述，%占位符% 已在生成时换成真实数值；纯加属性的物品为空串 */
  desc: WikiText;
  ability: AbilityDetail;
}

export type WikiShopSection = 'equipment' | 'consumable' | 'drop';

export interface WikiAbilityData {
  /** 内部名，名字与图标查 config/abilities.json */
  name: string;
  group: 'active' | 'passive';
  /** 抽选池档位 1–5，越高越难抽到；页面显示的编号是反过来的 */
  tier: number;
}

export interface WikiLotteryItemData {
  name: string;
  tier: number;
}

export interface WikiShopItemData {
  name: string;
  section: WikiShopSection;
  /** 配方价加材料价逐层加总；掉落材料为 null */
  price: number | null;
  /** 按价格分的 1–5 档，越贵越高，与抽奖档位同方向，配色共用 */
  tier: number;
}

/**
 * 由 web/scripts/wiki-sync.mjs 生成，只有名单与档位，战绩页也引用，不带说明。
 * 技能与抽奖物品照 game 抽选池的顺序；商店装备按价格从低到高。
 */
export const WIKI_ABILITIES = WIKI_ABILITY_DATA.abilities as WikiAbilityData[];
export const WIKI_LOTTERY_ITEMS = WIKI_ITEM_DATA.lottery as WikiLotteryItemData[];
export const WIKI_SHOP_ITEMS = WIKI_ITEM_DATA.shop as WikiShopItemData[];
/** 商店价格档的四条边界，从低到高；与 bot 出装分档同一组，取值以同步脚本为准 */
export const WIKI_PRICE_TIERS = WIKI_ITEM_DATA.priceTiers as [number, number, number, number];
