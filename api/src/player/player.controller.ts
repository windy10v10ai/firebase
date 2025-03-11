import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { UpdatePlayerDto } from './dto/update-player.dto';
import { PlayerService } from './player.service';

@ApiTags('Player')
@Controller('player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get('/ranking')
  @ApiOperation({ summary: 'Get player rankings' })
  getPlayerRanking() {
    return this.playerService.getPlayerRanking();
  }
}
