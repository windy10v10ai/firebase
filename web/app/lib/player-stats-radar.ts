import { apiFetch } from './api';

/** 各项是近期各局在同难度玩家中百分位的平均，0–100，越大越好 */
export interface PlayerStatsRadar {
  damage: number;
  gold: number;
  participation: number;
  push: number;
  /** 已反过来算，死得越少越高 */
  deaths: number;
  tank: number;
  healing: number;
  assists: number;
  stuns: number;
}

export interface PlayerStatsRadarResponse {
  /** 近期场次里能和基准比较的局数 */
  matchCount: number;
  minMatchCount: number;
  /** 局数不够或还没有基准时为 null */
  radar: PlayerStatsRadar | null;
}

export type BattleRadarCorner = 'damage' | 'participation' | 'gold' | 'push' | 'survival' | 'support';

// 承伤与死亡各占一半：只看死亡，躲在后排不上前的人得分最高
const SURVIVAL_TANK_WEIGHT = 0.5;
// 治疗型和助攻型辅助很少两项都高，以较高的一项为主才不会互相拖低，另一项只加分，两项都会的排在只会一项的前面
const SUPPORT_SECONDARY_WEIGHT = 0.3;
// 控制人人都有，只占一点，免得单靠控制就像辅助
const SUPPORT_STUNS_WEIGHT = 0.1;

/** 把接口的各项合成六边形的六个角。 */
export function battleRadarCorners(radar: PlayerStatsRadar): Record<BattleRadarCorner, number> {
  const survival = SURVIVAL_TANK_WEIGHT * radar.tank + (1 - SURVIVAL_TANK_WEIGHT) * radar.deaths;
  const primary = Math.max(radar.healing, radar.assists);
  const secondary = Math.min(radar.healing, radar.assists);
  const support =
    (1 - SUPPORT_STUNS_WEIGHT) * Math.min(100, primary + SUPPORT_SECONDARY_WEIGHT * secondary) +
    SUPPORT_STUNS_WEIGHT * radar.stuns;
  return {
    damage: radar.damage,
    participation: radar.participation,
    gold: radar.gold,
    push: radar.push,
    survival: Math.round(survival),
    support: Math.round(support),
  };
}

export function fetchStatsRadar(steamId: string) {
  return apiFetch<PlayerStatsRadarResponse>(`/api/player/${steamId}/stats/radar`);
}
