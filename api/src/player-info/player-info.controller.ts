import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from '../analytics/analytics.service';
import { UsePlayerMemberPointsDto } from '../player/dto/use-player-member-points.dto';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyItemDto } from '../player-property/dto/player-property-item.dto';
import { ResetPlayerPropertyDto } from '../player-property/dto/reset-player-property.dto';
import { UpgradePlayerPropertyDto } from '../player-property/dto/upgrade-player-property.dto';
import { PlayerPropertyService } from '../player-property/player-property.service';

import { PlayerInfoInclude } from './assemblers/player-dto.assembler';
import { PlayerInfoDto } from './dto/player-info.dto';
import { PlayerInfoService } from './player-info.service';

@ApiTags('Player Info')
@Controller('player')
export class PlayerInfoController {
  constructor(
    private readonly playerInfoService: PlayerInfoService,
    private readonly playerPropertyService: PlayerPropertyService,
    private readonly analyticsService: AnalyticsService,
    private readonly playerService: PlayerService,
  ) {}

  @Get(':steamId/info')
  @ApiOperation({ summary: 'Get player info with optional includes' })
  @ApiQuery({
    name: 'include',
    required: false,
    description: 'Comma-separated list of optional fields: member, property, setting',
    example: 'member,property,setting',
  })
  async getPlayerInfo(
    @Param('steamId', ParseIntPipe) steamId: number,
    @Query('include', new ParseArrayPipe({ items: String, separator: ',', optional: true }))
    include: PlayerInfoInclude[] = [],
  ): Promise<PlayerInfoDto> {
    return this.playerInfoService.findPlayerInfoBySteamId(steamId, include);
  }

  @Post('/member-points/use')
  @ApiOperation({ summary: 'Use available member points' })
  async useMemberPoint(@Body() dto: UsePlayerMemberPointsDto): Promise<PlayerInfoDto> {
    await this.playerService.useMemberPoint(dto);
    return this.playerInfoService.findPlayerInfoBySteamId(dto.steamId, []);
  }

  @Put(':steamId/property')
  @ApiOperation({ summary: 'Upgrade player property' })
  async upgradePlayerProperty(
    @Param('steamId', ParseIntPipe) steamId: number,
    @Body() dto: UpgradePlayerPropertyDto,
  ): Promise<PlayerInfoDto> {
    await this.playerPropertyService.upgrade({ steamId, ...dto });
    return this.playerInfoService.findPlayerInfoBySteamId(steamId, ['property']);
  }

  @Delete(':steamId/property')
  @ApiOperation({ summary: 'Reset player properties' })
  async resetPlayerProperty(
    @Param('steamId', ParseIntPipe) steamId: number,
    @Query('useMemberPoint', ParseBoolPipe) useMemberPoint: boolean,
  ): Promise<PlayerInfoDto> {
    const resetDto: ResetPlayerPropertyDto = { steamId, useMemberPoint };
    await this.playerPropertyService.reset(steamId, useMemberPoint);
    await this.analyticsService.playerResetProperty(resetDto);
    return this.playerInfoService.findPlayerInfoBySteamId(steamId, ['property']);
  }

  /** @deprecated Use PUT /:steamId/property instead */
  @Put('property')
  @ApiOperation({ summary: '[Deprecated] Upgrade player property', deprecated: true })
  async upgradePlayerPropertyDeprecated(
    @Body() dto: PlayerPropertyItemDto,
  ): Promise<PlayerInfoDto> {
    return this.upgradePlayerProperty(dto.steamId, { name: dto.name, level: dto.level });
  }
}
