import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions/v2';

import { LauncherReleaseDto } from './dto/launcher-release.dto';

// 发布新版启动器时与 web 的 LAUNCHER_VERSION、LAUNCHER_MAC_VERSION 一起改，哈希取自 web/public/downloads 下的 exe 与 ZIP
export const LAUNCHER_RELEASE: LauncherReleaseDto = {
  version: '0.7.1',
  sha256: 'f41bacab3052f0867fb6e98203b3bba12e839fc5cbb806308feb343ee1571c46',
};
export const LAUNCHER_MAC_RELEASE: LauncherReleaseDto | undefined = {
  version: '0.7.1',
  sha256: '258baf4dc5f2cb13457d120fc69a81da97026ec1d3c973cb55b0d176e18645cd',
};
export const LAUNCHER_VERSION_CACHE_SECONDS = 3600;

const DOWNLOAD_ORIGIN = 'https://windy10v10ai.com';
const REQUEST_TIMEOUT_MS = 8000;

@Injectable()
export class LauncherReleaseService {
  private readonly packages = new Map<string, Buffer>();

  getRelease(platform: string): LauncherReleaseDto | undefined {
    if (platform === 'windows') return LAUNCHER_RELEASE;
    if (platform === 'macos') return LAUNCHER_MAC_RELEASE;
    return undefined;
  }

  /** 取最新版启动器的 exe，取不到或内容与发布哈希不符时返回 undefined */
  async getExe(): Promise<Buffer | undefined> {
    return this.getPackage('windows');
  }

  /** 安装包太大、不能由本服务转发的平台，返回官网上的下载地址。 */
  getDownloadUrl(platform: string): string | undefined {
    const release = this.getRelease(platform);
    if (!release || platform !== 'macos') return undefined;
    return `${DOWNLOAD_ORIGIN}/downloads/Windy10v10AI-${release.version}-macos-arm64.zip`;
  }

  /** 读取已发布的平台安装包并校验哈希，失败时不缓存。 */
  async getPackage(platform: string): Promise<Buffer | undefined> {
    const cached = this.packages.get(platform);
    if (cached) return cached;
    const release = this.getRelease(platform);
    if (!release) return undefined;
    const { version, sha256 } = release;
    const file =
      platform === 'macos'
        ? `Windy10v10AI-${version}-macos-arm64.zip`
        : `Windy10v10AI-${version}.exe`;
    try {
      const response = await fetch(`${DOWNLOAD_ORIGIN}/downloads/${file}`, {
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
      this.packages.set(platform, exe);
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
