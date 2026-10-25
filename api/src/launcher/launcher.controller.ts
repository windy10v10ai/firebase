import {
  BadGatewayException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { Public } from '../util/auth/public.decorator';

import { LauncherReleaseDto } from './dto/launcher-release.dto';
import { WorkshopVersionDto } from './dto/workshop-version.dto';
import { LAUNCHER_VERSION_CACHE_SECONDS, LauncherReleaseService } from './launcher-release.service';
import {
  LAUNCHER_WORKSHOP_IDS,
  LauncherWorkshopService,
  WORKSHOP_CACHE_SECONDS,
} from './launcher-workshop.service';

// 启动器是分发给玩家的 exe，放进去的 key 等于公开，所以不设鉴权，靠限定物品 ID 控制用途
@Public()
@ApiTags('Launcher')
@Controller('launcher')
export class LauncherController {
  constructor(
    private readonly launcherWorkshopService: LauncherWorkshopService,
    private readonly launcherReleaseService: LauncherReleaseService,
  ) {}

  // 大陆部分网络直连不了 Steam，启动器直连失败时经国内代理来这里查
  @Get('workshop/:id')
  @Header('Cache-Control', `public, max-age=${WORKSHOP_CACHE_SECONDS}`)
  @ApiOperation({ summary: 'Get the published version of a launcher Workshop map' })
  async getWorkshopVersion(@Param('id') id: string): Promise<WorkshopVersionDto> {
    if (!LAUNCHER_WORKSHOP_IDS.includes(id)) {
      throw new NotFoundException();
    }
    const version = await this.launcherWorkshopService.getVersion(id);
    if (!version) {
      throw new BadGatewayException();
    }
    return version;
  }

  @Get('version')
  @Header('Cache-Control', `public, max-age=${LAUNCHER_VERSION_CACHE_SECONDS}`)
  @ApiOperation({ summary: 'Get the latest launcher version for self-update' })
  getVersion(@Query('platform') platform = 'windows'): LauncherReleaseDto {
    const release = this.launcherReleaseService.getRelease(platform);
    if (!release) throw new NotFoundException();
    return platform === 'macos' ? { ...release, platform: 'macos' } : release;
  }

  // 国内代理只转发 /api/，大陆玩家经它下载新版只能走这里
  @Get('download/:version')
  @ApiOperation({ summary: 'Download the latest launcher exe' })
  async download(
    @Param('version') version: string,
    @Query('platform') platform = 'windows',
    @Res() res: Response,
  ): Promise<void> {
    const release = this.launcherReleaseService.getRelease(platform);
    if (!release || version !== release.version) {
      throw new NotFoundException();
    }
    // 只在成功时设永久缓存，失败响应不能被 CDN 按版本号地址长期缓存
    const cacheControl = 'public, max-age=31536000, immutable';
    // Cloud Run 单个响应超过 32 MiB 会被截断，Mac 的 ZIP 更大，改由官网发出；应用内更新会校验哈希
    const downloadUrl = this.launcherReleaseService.getDownloadUrl(platform);
    if (downloadUrl) {
      res.setHeader('Cache-Control', cacheControl);
      res.redirect(302, downloadUrl);
      return;
    }
    const exe = await this.launcherReleaseService.getPackage(platform);
    if (!exe) {
      throw new BadGatewayException();
    }
    res.setHeader('Cache-Control', cacheControl);
    res.type('application/octet-stream').send(exe);
  }
}
