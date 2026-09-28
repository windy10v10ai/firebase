import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { WorkshopVersionDto } from './dto/workshop-version.dto';

const PUBLISHED_FILE_DETAILS_URL =
  'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/';
// 启动器只检测正式图与测试图，限定 ID 免得接口被当成通用的 Steam 代理
export const LAUNCHER_WORKSHOP_IDS = ['2307479570', '2636824668'];
// 启动器自己还有一路直连 Steam，这里宁可快速失败也不拖住它的等待
const REQUEST_TIMEOUT_MS = 3000;
// 新版发布后最多晚一分钟被启动器看到，换来同一实例上的玩家共用一次 Steam 请求
export const WORKSHOP_CACHE_SECONDS = 60;

interface PublishedFileDetails {
  publishedfileid?: string;
  result?: number;
  hcontent_file?: string;
  time_updated?: number;
}

interface PublishedFileDetailsResponse {
  response?: {
    publishedfiledetails?: PublishedFileDetails[];
  };
}

@Injectable()
export class LauncherWorkshopService {
  private readonly cache = new Map<string, { version: WorkshopVersionDto; expiresAt: number }>();

  /** 查创意工坊物品当前发布的版本，Steam 不通时返回 undefined 而不抛错 */
  async getVersion(id: string): Promise<WorkshopVersionDto | undefined> {
    const cached = this.cache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.version;
    }

    const version = await this.fetchVersion(id);
    if (version) {
      this.cache.set(id, { version, expiresAt: Date.now() + WORKSHOP_CACHE_SECONDS * 1000 });
    }
    return version;
  }

  private async fetchVersion(id: string): Promise<WorkshopVersionDto | undefined> {
    try {
      const response = await fetch(PUBLISHED_FILE_DETAILS_URL, {
        method: 'POST',
        body: new URLSearchParams({ itemcount: '1', 'publishedfileids[0]': id }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        logger.warn('Steam 创意工坊接口返回异常', { id, status: response.status });
        return undefined;
      }

      const body = (await response.json()) as PublishedFileDetailsResponse;
      const details = body.response?.publishedfiledetails?.find(
        (item) => item.publishedfileid === id,
      );
      if (!details?.hcontent_file || !details.time_updated) {
        logger.warn('Steam 创意工坊接口缺少版本字段', { id, result: details?.result });
        return undefined;
      }
      return { id, manifest: details.hcontent_file, timeUpdated: details.time_updated };
    } catch (error) {
      logger.warn('Steam 创意工坊请求失败', {
        id,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return undefined;
    }
  }
}
