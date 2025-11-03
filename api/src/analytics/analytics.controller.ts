import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { SecretService } from '../util/secret/secret.service';

import { AnalyticsService } from './analytics.service';
import { PickListDto } from './dto/pick-ability-dto';
import { ItemListDto } from './dto/pick-item-dto';
import { PlayerLanguageListDto } from './dto/player-language-dto';

@ApiTags('Analytics(GA4)')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly secretService: SecretService,
  ) {}

  @Post('/game-end/pick/abilities')
  async gameEndLotteryPickAbilities(@Body() body: PickListDto, @Req() req: Request): Promise<void> {
    const apiKey = req.headers['x-api-key'] as string;
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    await this.analyticsService.gameEndPickAbilities(body, serverType);
  }

  @Post('/game-end/item-builds')
  async gameEndItemBuilds(@Body() body: ItemListDto, @Req() req: Request): Promise<void> {
    const apiKey = req.headers['x-api-key'] as string;
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    await this.analyticsService.gameEndItemBuilds(body, serverType);
  }

  @Post('/player/language')
  async trackPlayerLanguage(
    @Body() body: PlayerLanguageListDto,
    @Req() req: Request,
  ): Promise<void> {
    const apiKey = req.headers['x-api-key'] as string;
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    await this.analyticsService.trackPlayerLanguage(body, serverType);
  }
}
