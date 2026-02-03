import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from '../analytics/analytics.service';
import { GameResetPlayerProperty } from '../game/dto/game-reset-player-property';
import { UpdatePlayerPropertyDto } from '../player-property/dto/update-player-property.dto';

import { PlayerDto } from './dto/player.dto';
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
    @Body() updatePlayerPropertyDto: UpdatePlayerPropertyDto,
  ): Promise<PlayerDto> {
    return await this.playerInfoService.upgradePlayerProperty(updatePlayerPropertyDto);
  }

  @Post('property/reset')
  @ApiOperation({ summary: 'Reset player properties' })
  async resetPlayerProperty(
    @Body() gameResetPlayerProperty: GameResetPlayerProperty,
  ): Promise<PlayerDto> {
    await this.playerInfoService.resetPlayerProperty(
      gameResetPlayerProperty.steamId,
      gameResetPlayerProperty.useMemberPoint,
    );
    await this.analyticsService.playerResetProperty(gameResetPlayerProperty);
    return await this.playerInfoService.findPlayerDtoBySteamId(gameResetPlayerProperty.steamId);
  }
}
