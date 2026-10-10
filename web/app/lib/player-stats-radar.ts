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
// 治疗和助攻最能分出辅助；控制单人局也打得出来，单人玩家这一项不至于是 0
const SUPPORT_WEIGHTS = { healing: 0.4, assists: 0.4, stuns: 0.2 } as const;

/** 把接口的各项合成六边形的六个角。 */
export function battleRadarCorners(radar: PlayerStatsRadar): Record<BattleRadarCorner, number> {
  const survival = SURVIVAL_TANK_WEIGHT * radar.tank + (1 - SURVIVAL_TANK_WEIGHT) * radar.deaths;
  const support =
    SUPPORT_WEIGHTS.healing * radar.healing +
    SUPPORT_WEIGHTS.assists * radar.assists +
    SUPPORT_WEIGHTS.stuns * radar.stuns;
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
