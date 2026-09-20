import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { toSteamId64 } from '../util/steam-id';

const STEAM_PLAYER_SUMMARIES_URL =
  'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/';
// Steam 偶发慢响应，超过这个时长就当没查到：个人主页宁可先显示 ID 也不该一直转圈
const REQUEST_TIMEOUT_MS = 3000;

export interface SteamPlayerSummary {
  personaName: string;
  avatarUrl: string;
}

interface PlayerSummariesResponse {
  response?: {
    players?: { steamid: string; personaname?: string; avatarfull?: string }[];
  };
}

@Injectable()
export class SteamProfileApiService {
  /** 向 Steam 查一个玩家的昵称与头像，任何一环不通都返回 undefined 而不抛错 */
  async fetchPlayerSummary(steamId: number): Promise<SteamPlayerSummary | undefined> {
    const apiKey = process.env.STEAM_WEB_API_KEY;
    if (!apiKey) {
      logger.error('STEAM_WEB_API_KEY 未配置，无法查询 Steam 玩家资料');
      return undefined;
    }

    const url = `${STEAM_PLAYER_SUMMARIES_URL}?key=${apiKey}&steamids=${toSteamId64(steamId)}`;
    try {
      // 请求地址带着 key，任何日志都不要把它打出来
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        logger.warn('Steam 玩家资料接口返回异常', { steamId, status: response.status });
        return undefined;
      }

      const body = (await response.json()) as PlayerSummariesResponse;
      const player = body.response?.players?.[0];
      if (!player?.personaname || !player.avatarfull) {
        return undefined;
      }
      return { personaName: player.personaname, avatarUrl: player.avatarfull };
    } catch (error) {
      logger.warn('Steam 玩家资料请求失败', {
        steamId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return undefined;
    }
  }
}
