import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { toAccountId, toSteamId64 } from '../util/steam-id';

const STEAM_PLAYER_SUMMARIES_URL =
  'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/';
// Steam 偶发慢响应，超过这个时长就当没查到：个人主页宁可先显示 ID 也不该一直转圈
const REQUEST_TIMEOUT_MS = 3000;
// GetPlayerSummaries 一次最多接受的 SteamID 个数
const SUMMARIES_BATCH_SIZE = 100;

export interface SteamPlayerSummary {
  personaName: string;
  avatarUrl: string;
}

interface SteamPlayer {
  steamid: string;
  personaname?: string;
  avatarmedium?: string;
  avatarfull?: string;
}

interface PlayerSummariesResponse {
  response?: {
    players?: SteamPlayer[];
  };
}

@Injectable()
export class SteamProfileApiService {
  /** 向 Steam 查一个玩家的昵称与头像，任何一环不通都返回 undefined 而不抛错 */
  async fetchPlayerSummary(steamId: number): Promise<SteamPlayerSummary | undefined> {
    const players = await this.requestPlayers([steamId], { steamId });
    const player = players?.[0];
    if (!player?.personaname || !player.avatarfull) {
      return undefined;
    }
    return { personaName: player.personaname, avatarUrl: player.avatarfull };
  }

  /** 批量查昵称与中号头像，按 32 位账号 ID 索引；查不到的玩家不在结果里，不抛错 */
  async fetchPlayerSummaries(steamIds: number[]): Promise<Map<number, SteamPlayerSummary>> {
    const batches: number[][] = [];
    for (let i = 0; i < steamIds.length; i += SUMMARIES_BATCH_SIZE) {
      batches.push(steamIds.slice(i, i + SUMMARIES_BATCH_SIZE));
    }
    const results = await Promise.all(
      batches.map((batch) => this.requestPlayers(batch, { count: batch.length })),
    );

    const summaries = new Map<number, SteamPlayerSummary>();
    for (const player of results.flatMap((players) => players ?? [])) {
      const accountId = toAccountId(player.steamid);
      if (accountId && player.personaname && player.avatarmedium) {
        summaries.set(accountId, {
          personaName: player.personaname,
          avatarUrl: player.avatarmedium,
        });
      }
    }
    return summaries;
  }

  private async requestPlayers(
    steamIds: number[],
    logContext: Record<string, number>,
  ): Promise<SteamPlayer[] | undefined> {
    const apiKey = process.env.STEAM_WEB_API_KEY;
    if (!apiKey) {
      logger.error('STEAM_WEB_API_KEY 未配置，无法查询 Steam 玩家资料');
      return undefined;
    }

    const url = `${STEAM_PLAYER_SUMMARIES_URL}?key=${apiKey}&steamids=${steamIds.map(toSteamId64).join(',')}`;
    try {
      // 请求地址带着 key，任何日志都不要把它打出来
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        logger.warn('Steam 玩家资料接口返回异常', { ...logContext, status: response.status });
        return undefined;
      }

      const body = (await response.json()) as PlayerSummariesResponse;
      return body.response?.players;
    } catch (error) {
      logger.warn('Steam 玩家资料请求失败', {
        ...logContext,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return undefined;
    }
  }
}
