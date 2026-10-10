'use client';

import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';
import { steamProfileQuery } from './queries';

/** 取某个玩家的 Steam 昵称头像；取不到时为 undefined，由调用方退回只显示 ID */
export function useSteamProfile(steamId: string | null) {
  const { initialProfile } = useAuth();
  const { data } = useQuery({
    ...steamProfileQuery(steamId ?? ''),
    enabled: steamId !== null,
    // 提示 cookie 只做首屏占位，不写进缓存，真实资料照常去取
    placeholderData: initialProfile?.steamId === steamId ? initialProfile : undefined,
  });
  return data;
}
