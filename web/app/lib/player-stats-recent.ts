import { apiFetch } from './api';

/** 与 api 的 RECENT_MATCH_LIMIT 一致：后端只留这么多场 */
export const RECENT_MATCH_LIMIT = 50;

/** 一局里自己那一行 */
export interface RecentMatch {
  matchId: string;
  /** 服务端收到结算的时间，ISO 字符串 */
  endedAt: string;
  version: string;
  difficulty: number;
  durationSec: number;
  win: boolean;
  multiplierRadiant: number;
  multiplierDire: number;
  towerPowerPct: number;

  heroName: string;
  level: number;
  /** 0 = 未觉醒，1 = 已觉醒 */
  awaken: number;
  isDisconnected: boolean;

  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  totalGoldEarned: number;
  heroDamage: number;
  damageTaken: number;
  healing: number;
  towerKills: number;
  stuns: number;
  roshanKills: number;
  battlePoints: number;

  /** 游戏端发版前的场次没有这三项 */
  strength?: number;
  agility?: number;
  intellect?: number;
  /** 六格物品栏，空格是空字符串；与属性同批加入，旧场次没有 */
  items?: string[];
  neutralItem?: string;
  neutralPassiveItem?: string;
  /** 抽选的主动、被动、第二被动，没抽的是空字符串 */
  abilities?: string[];
}

export interface RecentMatches {
  matches: RecentMatch[];
}

export function fetchRecentMatches(steamId: string) {
  return apiFetch<RecentMatches>(`/api/player/${steamId}/stats/recent`);
}
