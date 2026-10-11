import type { PlayerInfo } from './player-info';
import type { SteamProfile } from './steam-profile';

export const SHARE_IMAGE = '/images/share.png';

// 爬虫等不了太久，超时就当取不到，退回全站通用卡片
const FETCH_TIMEOUT_MS = 1500;

export interface ProfileShare {
  personaName: string | null;
  avatarUrl: string | null;
  matchCount: number;
  winCount: number;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${process.env.API_ORIGIN}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** 取个人主页分享卡片要用的公开数据，主页未公开或取不到时返回 null */
export async function fetchProfileShare(steamId: string): Promise<ProfileShare | null> {
  if (!/^\d+$/.test(steamId)) {
    return null;
  }
  // 不带任何凭据，API 按未登录访客处理：主页未公开时两条都是 403，数据不会出 API
  const [info, profile] = await Promise.all([
    fetchJson<PlayerInfo>(`/api/player/${steamId}/info`),
    fetchJson<SteamProfile>(`/api/player/${steamId}/steam-profile`),
  ]);
  if (!info) {
    return null;
  }
  return {
    personaName: profile?.personaName ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    matchCount: info.matchCount ?? 0,
    winCount: info.winCount ?? 0,
  };
}
