import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { LauncherReleaseDto } from './dto/launcher-release.dto';

// 发布新版启动器时与 web 的 LAUNCHER_VERSION 一起改，哈希取自 web/public/downloads 下的 exe
export const LAUNCHER_RELEASE: LauncherReleaseDto = {
  version: '0.3.0',
  sha256: '7568e60db94538be2313508570165f482f94014f96be9e2b7d370c08d35ae560',
};
export const LAUNCHER_VERSION_CACHE_SECONDS = 3600;

const DOWNLOAD_ORIGIN = 'https://windy10v10ai.com';
const REQUEST_TIMEOUT_MS = 8000;

@Injectable()
export class LauncherReleaseService {
  private exe: Buffer | undefined;

  /** 取最新版启动器的 exe，取不到或内容与发布哈希不符时返回 undefined */
  async getExe(): Promise<Buffer | undefined> {
    if (this.exe) {
      return this.exe;
    }

    const { version, sha256 } = LAUNCHER_RELEASE;
    try {
      const response = await fetch(`${DOWNLOAD_ORIGIN}/downloads/Windy10v10AI-${version}.exe`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        logger.warn('启动器 exe 下载失败', { version, status: response.status });
        return undefined;
      }

      const exe = Buffer.from(await response.arrayBuffer());
      // 下载地址按版本号永久缓存在 CDN 上，内容不对时宁可失败也不能让它被缓存下来
      if (createHash('sha256').update(exe).digest('hex') !== sha256) {
        logger.warn('启动器 exe 哈希与发布版本不符', { version });
        return undefined;
      }
      this.exe = exe;
      return exe;
    } catch (error) {
      logger.warn('启动器 exe 请求失败', {
        version,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return undefined;
    }
  }
}
