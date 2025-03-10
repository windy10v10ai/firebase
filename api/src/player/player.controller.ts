import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { UpdatePlayerDto } from './dto/update-player.dto';
import { PlayerService } from './player.service';

@ApiTags('Player')
@Controller('player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get('/steamId/:steamId')
  findOne(@Param('steamId') steamId: string) {
    return this.playerService.findBySteamId(+steamId);
  }

  @Patch('/steamId/:steamId')
  upsert(@Param('steamId') steamId: number, @Body() updatePlayerDto: UpdatePlayerDto) {
    return this.playerService.upsertAddPoint(steamId, updatePlayerDto);
  }

  @Get('/rank')
  @ApiOperation({ summary: 'Get player rankings' })
  getPlayerRank() {
    return this.playerService.getPlayerRank();
  }
}
