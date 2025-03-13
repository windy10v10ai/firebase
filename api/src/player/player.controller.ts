import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PlayerRanking } from './entities/player-ranking.entity';
import { PlayerRankingService } from './player-ranking.service';
import { PlayerService } from './player.service';

@ApiTags('Player')
@Controller('player')
export class PlayerController {
  constructor(
    private readonly playerService: PlayerService,
    private readonly playerRankingService: PlayerRankingService,
  ) {}

  @Get('/ranking')
  @ApiOperation({ summary: 'Get player rankings' })
  getRanking(): Promise<PlayerRanking> {
    return this.playerRankingService.getRanking();
  }
}
