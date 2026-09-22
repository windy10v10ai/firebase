import { apiFetch } from './api';

// 与 API 数名次时的上限一致，超出时接口只说「数不到」
const RANK_COUNT_LIMIT = 10000;

export interface RankedPlayer {
  steamId: string;
  personaName: string | null;
  avatarUrl: string | null;
}

export interface Leaderboard {
  /** UTC 天号 YYYYMMDD */
  date: string;
  /** 按累计勇士积分从高到低，下标加 1 即名次 */
  players: RankedPlayer[];
}

/** 取勇士积分榜前 500 名；接口允许浏览器缓存十分钟 */
export function fetchLeaderboard(): Promise<Leaderboard> {
  return apiFetch<Leaderboard>('/api/player/ranking');
}

/** 取玩家的实时名次，超出接口可数的范围时为 null */
export async function fetchBattleRank(steamId: string): Promise<number | null> {
  const { rank } = await apiFetch<{ rank: number | null }>(`/api/player/${steamId}/ranking`);
  return rank;
}

/** 名次的显示文字，数不到的显示成上限加号 */
export function formatBattleRank(rank: number | null): string {
  return rank === null ? `${RANK_COUNT_LIMIT.toLocaleString()}+` : rank.toLocaleString();
}
