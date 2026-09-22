/**
 * 结算界面用的那几张图标，从游戏包里取出来放进 public/icons/。
 * 只给每局都要横着比的指标配图，其余用文字——分界与游戏内结算界面一致，
 * 理由见 docs/design/player-stats-recent/README.md。
 */
export const GAME_ICON = {
  battlePoint: '/icons/battle-point.png',
  gold: '/icons/gold.png',
  heroDamage: '/icons/hero-damage.png',
  damageTaken: '/icons/damage-taken.png',
  healing: '/icons/healing.png',
  strength: '/icons/strength.png',
  agility: '/icons/agility.png',
  intellect: '/icons/intellect.png',
} as const;
