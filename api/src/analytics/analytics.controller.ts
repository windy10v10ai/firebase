import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from './analytics.service';
import { PickDto } from './dto/pick-ability-dto';

@ApiTags('Analytics(GA4)')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('/lottery/pick/ability')
  async lotteryPickAbility(@Body() body: PickDto) {
    await this.analyticsService.lotteryPickAbility(body);
  }

  @Post('/game-end/pick/ability')
  async gameEndLotteryPickAbility(@Body() body: PickDto) {
    await this.analyticsService.gameEndPickAbility(body);
  }

  // FIXME 移除物品pick统计
  @Post('/lottery/pick/item')
  async lotteryPickItem(@Body() body: PickDto) {
    await this.analyticsService.lotteryPickItem(body);
  }

  @Post('/game-end/pick/item')
  async gameEndLotteryPickItem(@Body() body: PickDto) {
    await this.analyticsService.gameEndPickItem(body);
  }
}
