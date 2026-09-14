import { apiFetch } from './api';

import type { PlayerInfo } from './player-info';

/** 觉醒的价码，与 api 的 player-hero-awakening.service.ts 保持一致 */
export const AWAKEN_SEASON_POINT_COST = 8000;
export const AWAKEN_MEMBER_POINT_COST = 4000;
/** 随机抽选命中候选时减半，由 API 自己派生，网站只用它算按钮上的数字 */
export const AWAKEN_RANDOM_SEASON_POINT_COST = 4000;
export const AWAKEN_RANDOM_MEMBER_POINT_COST = 2000;

/** 与 game 的 AWAKEN_RANDOM_CANDIDATE_COUNT 一致 */
export const AWAKEN_RANDOM_CANDIDATE_COUNT = 3;

/** 觉醒页要的数据，已觉醒列表与两种可用积分都在同一个响应里 */
export function fetchPlayerAwakening(steamId: string) {
  return apiFetch<PlayerInfo>(`/api/player/${steamId}/info?include=heroAwakening`);
}

export function awakenHero(steamId: string, heroName: string, useMemberPoint: boolean) {
  return apiFetch<PlayerInfo>(`/api/player/${steamId}/hero-awakening`, {
    method: 'PUT',
    body: JSON.stringify({ heroName, useMemberPoint }),
  });
}

/**
 * 候选由客户端摇好后上传，后端只负责存。
 * 幂等：账号里已有未认领的候选时，后端忽略上传值、原样返回旧的那份，
 * 所以调用方必须渲染返回值——游戏里摇好没认领的名单就是这样回到网站的。
 */
export function ensureRandomCandidates(steamId: string, candidates: string[]) {
  return apiFetch<{ candidates: string[] }>(`/api/player/${steamId}/hero-awakening/random`, {
    method: 'PUT',
    body: JSON.stringify({ candidates }),
  });
}

/** 从可觉醒池里排除已觉醒后随机取 count 个；剩余不足时返回空数组，调用方据此禁用抽选 */
export function pickRandomCandidates(
  allHeroNames: string[],
  awakenedHeroNames: string[],
  count: number = AWAKEN_RANDOM_CANDIDATE_COUNT,
): string[] {
  const pool = allHeroNames.filter((name) => !awakenedHeroNames.includes(name));
  if (pool.length < count) {
    return [];
  }
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked;
}

/** public/dota/ 下的文件名转成可直接用的地址 */
export function awakenAssetPath(file: string) {
  return `/dota/${file}`;
}
