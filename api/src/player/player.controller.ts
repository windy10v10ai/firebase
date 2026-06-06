import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../util/auth/public.decorator';

import { ConductPlayerDto } from './dto/conduct-player.dto';
import { UpdatePlayerSettingDto } from './dto/update-player-setting.dto';
import { UsePlayerMemberPointsDto } from './dto/use-player-member-points.dto';
import { PlayerRanking } from './entities/player-ranking.entity';
import { PlayerSetting } from './entities/player-setting.entity';
import { Player } from './entities/player.entity';
import { PlayerConductService } from './player-conduct.service';
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
  ) {}

  @Public()
  @Get('/ranking')
  @ApiOperation({ summary: 'Get player rankings' })
  getRanking(): Promise<PlayerRanking> {
    return this.playerRankingService.getRanking();
  }

  // TODO: 临时统计接口，用完删除
  @Get('/conduct-point-stats')
  @ApiOperation({ summary: '[Temp] conductPoint distribution for players active since April 2026' })
  getConductPointStats() {
    return this.playerService.getConductPointStats();
  }

  @Get(':id/setting')
  @ApiOperation({ summary: 'Get player setting' })
  async getPlayerSetting(@Param('id') id: string): Promise<PlayerSetting> {
    return await this.playerSettingService.getPlayerSettingOrGenerateDefault(id);
  }

  @Put(':id/setting')
  @ApiOperation({ summary: 'Update player setting' })
  async updatePlayerSetting(
    @Param('id') id: string,
    @Body() updatePlayerSettingDto: UpdatePlayerSettingDto,
  ): Promise<PlayerSetting> {
    return await this.playerSettingService.update(id, updatePlayerSettingDto);
  }

  @Post('/conduct')
  @ApiOperation({ summary: 'Commend or report another player' })
  async conduct(@Body() dto: ConductPlayerDto): Promise<Player> {
    return this.playerConductService.conduct(dto);
  }

  @Post('/member-points/use')
  @ApiOperation({ summary: 'Use available member points' })
  async useMemberPoint(@Body() dto: UsePlayerMemberPointsDto): Promise<Player> {
    return this.playerService.useMemberPoint(dto);
  }
}
