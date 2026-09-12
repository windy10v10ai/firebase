import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AllowLocal } from '../util/auth/allow-local.decorator';

import { ConductPlayerDto } from './dto/conduct-player.dto';
import { UpdatePlayerGamePresetDto } from './dto/update-player-game-preset.dto';
import { UpdatePlayerSettingDto } from './dto/update-player-setting.dto';
import { PlayerRanking } from './entities/player-ranking.entity';
import { PlayerSetting } from './entities/player-setting.entity';
import { Player } from './entities/player.entity';
import { PlayerConductService } from './player-conduct.service';
import { PlayerGamePresetService } from './player-game-preset.service';
import { PlayerRankingService } from './player-ranking.service';
import { PlayerSettingService } from './player-setting.service';
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
  ) {}

  @AllowLocal()
  @Get('/ranking')
  @ApiOperation({ summary: 'Get player rankings' })
  getRanking(): Promise<PlayerRanking> {
    return this.playerRankingService.getRanking();
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

  @Post('/conduct')
  @ApiOperation({ summary: 'Commend or report another player' })
  async conduct(@Body() dto: ConductPlayerDto): Promise<Player> {
    return this.playerConductService.conduct(dto);
  }
}
