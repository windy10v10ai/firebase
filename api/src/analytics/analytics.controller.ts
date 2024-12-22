import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from './analytics.service';
import { GameEndDto } from './dto/game-end-dto';
import { PickDto } from './dto/pick-ability-dto';

@ApiTags('Analytics(GA4)')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('/lottery/pick/ability')
  async lotteryPickAbility(@Body() body: PickDto) {
    await this.analyticsService.lotteryPickAbility(body);
  }

  @Post('/lottery/pick/item')
  async lotteryPickItem(@Body() body: PickDto) {
    await this.analyticsService.lotteryPickItem(body);
  }

  // TODO remove after v4.05
  @Post('/game/end')
  async gameEnd(@Body() body: GameEndDto) {
    await this.analyticsService.gameEndMatch(body);
  }
}
