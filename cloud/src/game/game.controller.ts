import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  ParseArrayPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { MembersService } from '../members/members.service';
import { PlayerCountService } from '../player-count/player-count.service';

import { GameService } from './game.service';

@ApiTags('Game(Open)')
@Controller('game')
export class GameController {
  constructor(
    private readonly gameService: GameService,
    private readonly membersService: MembersService,
    private readonly playerCountService: PlayerCountService,
  ) {}

  @Get('start')
  async start(
    @Query('steamIds', new ParseArrayPipe({ items: Number, separator: ',' }))
    steamIds: number[],
    @Headers('x-api-key')
    apiKey: string,
    @Headers('x-country-code') countryCode: string,
  ) {
    steamIds = steamIds.filter((id) => id > 0);
    if (steamIds.length > 10) {
      throw new BadRequestException();
    }
    const res = await this.membersService.findBySteamIds(steamIds);
    try {
      await this.playerCountService.update({
        apikey: apiKey,
        countryCode: countryCode,
        playerIds: steamIds,
        memberIds: res.map((m) => m.steamId),
      });
    } catch (error) {
      console.error(error);
    }
    return res;
  }

  @Post('end')
  end(@Headers('x-api-key') apiKey: string, @Body() body: any): string {
    console.log(apiKey);
    console.log(body);
    return this.gameService.getHello();
  }
}
