import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from '../analytics/analytics.service';
import { PlayerPropertyItemDto } from '../player-property/dto/player-property-item.dto';

import { PlayerDto } from './dto/player.dto';
import { ResetPlayerPropertyDto } from './dto/reset-player-property.dto';
import { PlayerInfoService } from './player-info.service';

@ApiTags('Player Info')
@Controller('player')
export class PlayerInfoController {
  constructor(
    private readonly playerInfoService: PlayerInfoService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get(':steamId')
  @ApiOperation({ summary: 'Get player info by Steam ID' })
  async getPlayerInfo(@Param('steamId', ParseIntPipe) steamId: number): Promise<PlayerDto> {
    return await this.playerInfoService.findPlayerDtoBySteamId(steamId);
  }

  @Put('property')
  @ApiOperation({ summary: 'Upgrade player property' })
  async upgradePlayerProperty(
    @Body() updatePlayerPropertyDto: PlayerPropertyItemDto,
  ): Promise<PlayerDto> {
    await this.playerInfoService.upgradePlayerProperty(updatePlayerPropertyDto);
    return await this.playerInfoService.findPlayerDtoBySteamId(updatePlayerPropertyDto.steamId);
  }

  @Post('property/reset')
  @ApiOperation({ summary: 'Reset player properties' })
  async resetPlayerProperty(
    @Body() resetPlayerPropertyDto: ResetPlayerPropertyDto,
  ): Promise<PlayerDto> {
    await this.playerInfoService.resetPlayerProperty(
      resetPlayerPropertyDto.steamId,
      resetPlayerPropertyDto.useMemberPoint,
    );
    await this.analyticsService.playerResetProperty(resetPlayerPropertyDto);
    return await this.playerInfoService.findPlayerDtoBySteamId(resetPlayerPropertyDto.steamId);
  }
}
