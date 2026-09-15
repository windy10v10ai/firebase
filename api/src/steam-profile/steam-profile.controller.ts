import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AllowWeb } from '../util/auth/allow-web.decorator';

import { SteamProfileDto } from './dto/steam-profile.dto';
import { SteamProfileService } from './steam-profile.service';

@ApiTags('Player Info')
// 挂在已有的 player 前缀下，不必改 api/index.ts 的路径白名单
@Controller('player')
export class SteamProfileController {
  constructor(private readonly steamProfileService: SteamProfileService) {}

  // 只给网站用：游戏侧从 Dota2 官方接口就能拿到昵称头像，不挂 AllowLocal
  @AllowWeb()
  @Get(':steamId/steam-profile')
  @ApiOperation({ summary: 'Get Steam persona name and avatar url' })
  async getSteamProfile(@Param('steamId', ParseIntPipe) steamId: number): Promise<SteamProfileDto> {
    return this.steamProfileService.findBySteamId(steamId);
  }
}
