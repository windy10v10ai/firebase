import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PlayerRanking } from './entities/player-ranking.entity';
import { PlayerService } from './player.service';

@ApiTags('Player')
@Controller('player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get('/ranking')
  @ApiOperation({ summary: 'Get player rankings' })
  getPlayerRanking(): Promise<PlayerRanking> {
    return this.playerService.getRanking();
  }
}
