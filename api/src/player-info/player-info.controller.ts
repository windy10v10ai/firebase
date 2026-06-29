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

import { UsePlayerMemberPointsDto } from '../player/dto/use-player-member-points.dto';
import { PlayerService } from '../player/player.service';
import { AwakenHeroDto } from '../player-hero-awakening/dto/awaken-hero.dto';
import { EnsureRandomCandidatesDto } from '../player-hero-awakening/dto/ensure-random-candidates.dto';
import { PlayerHeroAwakeningService } from '../player-hero-awakening/player-hero-awakening.service';
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
    private readonly playerService: PlayerService,
    private readonly playerHeroAwakeningService: PlayerHeroAwakeningService,
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
    await this.playerPropertyService.reset(steamId, useMemberPoint);
    return this.playerInfoService.findPlayerInfoBySteamId(steamId, ['property']);
  }

  @Put(':steamId/hero-awakening')
  @ApiOperation({ summary: 'Awaken a hero, spending season or member points' })
  async awakenHero(
    @Param('steamId', ParseIntPipe) steamId: number,
    @Body() dto: AwakenHeroDto,
  ): Promise<PlayerInfoDto> {
    await this.playerHeroAwakeningService.awaken(steamId, dto.heroName, dto.useMemberPoint);
    return this.playerInfoService.findPlayerInfoBySteamId(steamId, ['heroAwakening']);
  }

  @Put(':steamId/hero-awakening/random')
  @ApiOperation({ summary: 'Ensure random hero awakening candidates exist (idempotent, free)' })
  async ensureRandomHeroAwakeningCandidates(
    @Param('steamId', ParseIntPipe) steamId: number,
    @Body() dto: EnsureRandomCandidatesDto,
  ): Promise<{ candidates: string[] }> {
    const candidates = await this.playerHeroAwakeningService.ensureRandomCandidates(
      steamId,
      dto.candidates,
    );
    return { candidates };
  }
}
