import {
  BadGatewayException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../util/auth/public.decorator';

import { WorkshopVersionDto } from './dto/workshop-version.dto';
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
  constructor(private readonly launcherWorkshopService: LauncherWorkshopService) {}

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
}
