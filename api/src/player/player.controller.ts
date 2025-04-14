import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../util/auth/public.decorator';

import { UpdatePlayerSettingDto } from './dto/update-player-setting.dto';
import { PlayerRanking } from './entities/player-ranking.entity';
import { PlayerSetting } from './entities/player-setting.entity';
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
  ) {}

  @Public()
  @Get('/ranking')
  @ApiOperation({ summary: 'Get player rankings' })
  getRanking(): Promise<PlayerRanking> {
    return this.playerRankingService.getRanking();
  }

  @Put(':id/setting')
  async updatePlayerSetting(
    @Param('id') id: string,
    @Body() updatePlayerSettingDto: UpdatePlayerSettingDto,
  ): Promise<PlayerSetting> {
    return await this.playerSettingService.update(id, updatePlayerSettingDto);
  }
}
