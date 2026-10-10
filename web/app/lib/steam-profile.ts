import { apiFetch } from './api';
import { PLAYER_PROFILE_COOKIE, PLAYER_PROFILE_COOKIE_MAX_AGE_SECONDS } from './auth-hint';

export interface SteamProfile {
  steamId: string;
  personaName: string | null;
  avatarUrl: string | null;
}

// 写进服务端能读到的 cookie，下次打开页面首屏就带着昵称，不用等这次请求
function writeProfileHint(profile: SteamProfile) {
  const value = encodeURIComponent(JSON.stringify(profile));
  document.cookie = `${PLAYER_PROFILE_COOKIE}=${value}; path=/; samesite=lax; max-age=${PLAYER_PROFILE_COOKIE_MAX_AGE_SECONDS}`;
}

/** 取 Steam 昵称与头像地址。取不到时抛错，由调用方退回只显示 ID */
export async function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  const profile = await apiFetch<SteamProfile>(`/api/player/${steamId}/steam-profile`);
  writeProfileHint(profile);
  return profile;
}
