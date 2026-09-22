import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AllowLocal } from '../util/auth/allow-local.decorator';
import { AllowWeb } from '../util/auth/allow-web.decorator';

import { ConductPlayerDto } from './dto/conduct-player.dto';
import { PlayerStatsRecentResponse } from './dto/player-stats-recent.response';
import { UpdatePlayerGamePresetDto } from './dto/update-player-game-preset.dto';
import { UpdatePlayerSettingDto } from './dto/update-player-setting.dto';
import { PlayerRanking } from './entities/player-ranking.entity';
import { PlayerSetting } from './entities/player-setting.entity';
import { Player } from './entities/player.entity';
import { PlayerConductService } from './player-conduct.service';
import { PlayerGamePresetService } from './player-game-preset.service';
import { PlayerRankingService } from './player-ranking.service';
import { PlayerSettingService } from './player-setting.service';
import { PlayerStatsRecentService, RECENT_MATCH_LIMIT } from './player-stats-recent.service';
import { PlayerService } from './player.service';

@ApiTags('Player')
@Controller('player')
export class PlayerController {
  constructor(
    private readonly playerService: PlayerService,
    private readonly playerRankingService: PlayerRankingService,
    private readonly playerSettingService: PlayerSettingService,
    private readonly playerConductService: PlayerConductService,
    private readonly playerGamePresetService: PlayerGamePresetService,
    private readonly playerStatsRecentService: PlayerStatsRecentService,
  ) {}

  @AllowLocal()
  @Get('/ranking')
  @ApiOperation({ summary: 'Get player rankings' })
  getRanking(): Promise<PlayerRanking> {
    return this.playerRankingService.getRanking();
  }

  // 单独一条而不是并进 /:steamId/info：满员 50 场约 50 KB，挂在首屏依赖上会拖慢整页
  @AllowWeb()
  @Get(':steamId/stats/recent')
  @ApiOperation({ summary: 'Get recent matches' })
  async getStatsRecent(
    @Param('steamId', ParseIntPipe) steamId: number,
    @Query('limit', new DefaultValuePipe(RECENT_MATCH_LIMIT), ParseIntPipe) limit: number,
  ): Promise<PlayerStatsRecentResponse> {
    const stats = await this.playerStatsRecentService.findBySteamId(steamId);
    // Firestore 只能整份取，limit 省的是这一跳到浏览器的字节
    const take = Math.min(Math.max(limit, 1), RECENT_MATCH_LIMIT);
    return { matches: (stats?.matches ?? []).slice(0, take) };
  }

  @Get(':id/setting')
  @ApiOperation({ summary: 'Get player setting' })
  async getPlayerSetting(@Param('id') id: string): Promise<PlayerSetting> {
    return await this.playerSettingService.getPlayerSettingOrGenerateDefault(id);
  }

  @AllowLocal()
  @Put(':id/setting')
  @ApiOperation({ summary: 'Update player setting' })
  async updatePlayerSetting(
    @Param('id') id: string,
    @Body() updatePlayerSettingDto: UpdatePlayerSettingDto,
  ): Promise<PlayerSetting> {
    return await this.playerSettingService.update(id, updatePlayerSettingDto);
  }

  // game-preset 对应游戏内的「游戏选项」
  @AllowLocal()
  @Put(':id/game-preset')
  @ApiOperation({ summary: 'Save or clear a per-map game preset' })
  async updatePlayerGamePreset(
    @Param('id') id: string,
    @Body() dto: UpdatePlayerGamePresetDto,
  ): Promise<PlayerSetting> {
    return this.playerGamePresetService.update(id, dto);
  }

  @AllowLocal()
  @Post('/conduct')
  @ApiOperation({ summary: 'Commend or report another player' })
  async conduct(@Body() dto: ConductPlayerDto): Promise<Player> {
    return this.playerConductService.conduct(dto);
  }
}
