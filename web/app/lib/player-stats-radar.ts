import { apiFetch } from './api';

export const RADAR_AXES = ['damage', 'gold', 'participation', 'survival', 'tank', 'push'] as const;

export type RadarAxis = (typeof RADAR_AXES)[number];

/** 各项是同难度玩家中的百分位，0–100，越大越好 */
export type PlayerStatsRadar = Record<RadarAxis, number> & { score: number };

export interface PlayerStatsRadarResponse {
  /** 近期场次里能和基准比较的局数 */
  matchCount: number;
  minMatchCount: number;
  /** 局数不够或还没有基准时为 null */
  radar: PlayerStatsRadar | null;
}

export function fetchStatsRadar(steamId: string) {
  return apiFetch<PlayerStatsRadarResponse>(`/api/player/${steamId}/stats/radar`);
}
