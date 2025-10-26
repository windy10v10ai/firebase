import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { SecretService } from '../util/secret/secret.service';

import { AnalyticsService } from './analytics.service';
import { PickDto } from './dto/pick-ability-dto';
import { PlayerLanguageListDto } from './dto/player-language-dto';

@ApiTags('Analytics(GA4)')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly secretService: SecretService,
  ) {}

  @Post('/game-end/pick/ability')
  async gameEndLotteryPickAbility(
    @Body() body: PickDto,
    @Headers('x-api-key') apiKey: string,
  ): Promise<void> {
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    await this.analyticsService.gameEndPickAbility(body, serverType);
  }

  @Post('/player/language')
  async trackPlayerLanguage(
    @Body() body: PlayerLanguageListDto,
    @Headers('x-api-key') apiKey: string,
  ): Promise<void> {
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    await this.analyticsService.trackPlayerLanguage(body, serverType);
  }
}
