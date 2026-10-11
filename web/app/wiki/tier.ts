const MAX_TIER = 5;

/** 档位在页面上显示的编号。玩家习惯 T1 最稀有，与抽选池档位方向相反，数据与配色仍按抽选池的档位 */
export const tierLabel = (tier: number) => `T${MAX_TIER + 1 - tier}`;
