import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { MembersService } from '../members/members.service';
import { UpdatePlayerDto } from '../player/dto/update-player.dto';
import { Player } from '../player/entities/player.entity';
import { PlayerService } from '../player/player.service';
import { PlayerPropertyService } from '../player-property/player-property.service';

@ApiTags('Test')
@Controller('test')
export class TestController {
  constructor(
    private readonly playerService: PlayerService,
    private readonly playerPropertyService: PlayerPropertyService,
    private readonly membersService: MembersService,
  ) {}

  @Get('/player/steamId/:steamId')
  findOne(@Param('steamId') steamId: string): Promise<Player> {
    return this.playerService.findBySteamId(+steamId);
  }

  @Patch('/player/steamId/:steamId')
  upsert(@Param('steamId') steamId: number, @Body() updatePlayerDto: UpdatePlayerDto) {
    return this.playerService.upsertAddPoint(steamId, updatePlayerDto);
  }
}
