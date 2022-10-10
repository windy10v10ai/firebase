import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { GameService } from './game.service';

@ApiTags('Game(Open)')
@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('start')
  start(
    @Headers('x-api-key') apiKey: string,
    @Headers('x-country-code') countryCode: string,
  ): string {
    return this.gameService.getHello();
  }

  @Post('end')
  end(@Headers('x-api-key') apiKey: string, @Body() body: any): string {
    console.log(apiKey);
    console.log(body);
    return this.gameService.getHello();
  }
}
