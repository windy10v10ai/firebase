import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from './analytics.service';
import { PickDto } from './dto/pick-ability-dto';
import { PlayerLanguageListDto } from './dto/player-language-dto';

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

  @Post('/player/language')
  async trackPlayerLanguage(@Body() body: PlayerLanguageListDto) {
    await this.analyticsService.trackPlayerLanguage(body);
  }
}
