import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CreatePlayerPropertyDto } from './dto/create-player-property.dto';
import { UpdatePlayerPropertyDto } from './dto/update-player-property.dto';
import { PlayerPropertyService } from './player-property.service';

@ApiTags('Player Property')
@Controller('player-property')
export class PlayerPropertyController {
  constructor(private readonly playerPropertyService: PlayerPropertyService) {}

  @Post()
  create(@Body() createPlayerPropertyDto: CreatePlayerPropertyDto) {
    return this.playerPropertyService.create(createPlayerPropertyDto);
  }

  @Put()
  update(@Body() updatePlayerPropertyDto: UpdatePlayerPropertyDto) {
    return this.playerPropertyService.update(updatePlayerPropertyDto);
  }

  @Get('/csv')
  csv() {
    return this.playerPropertyService.csv();
  }

  @Get('/steamId/:steamId')
  findBySteamId(@Param('steamId') steamId: string) {
    return this.playerPropertyService.findBySteamId(+steamId);
  }

  @Delete('/steamId/:steamId')
  deleteBySteamId(@Param('steamId') steamId: string) {
    return this.playerPropertyService.deleteBySteamId(+steamId);
  }
}
