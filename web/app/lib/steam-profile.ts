import { apiFetch } from './api';

export interface SteamProfile {
  steamId: string;
  personaName: string | null;
  avatarUrl: string | null;
}

// 头部账号区在每个页面都渲染，个人主页上同一个玩家还会再要一次，
// 所以按 steamId 记住结果与在途请求，一个标签页内只发一次。
const requests = new Map<string, Promise<SteamProfile>>();

/** 取 Steam 昵称与头像地址。取不到时两个字段为 null，由调用方退回只显示 ID */
export function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  const pending = requests.get(steamId);
  if (pending) {
    return pending;
  }

  const request = apiFetch<SteamProfile>(`/api/player/${steamId}/steam-profile`).catch(() => {
    // 失败不留在表里，下次进页面还能再试一次
    requests.delete(steamId);
    return { steamId, personaName: null, avatarUrl: null };
  });
  requests.set(steamId, request);
  return request;
}
