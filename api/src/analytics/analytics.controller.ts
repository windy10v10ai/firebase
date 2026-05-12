import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { SecretService } from '../util/secret/secret.service';

import { AnalyticsService } from './analytics.service';
import { ItemListDto } from './dto/pick-item-dto';
import { PlayerLanguageListDto } from './dto/player-language-dto';

@ApiTags('Analytics(GA4)')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly secretService: SecretService,
  ) {}

  /** @deprecated 临时恢复用于验证 game_end_bot event 减少原因，验证完毕后删除 */
  @Post('/game-end/item-builds')
  async gameEndItemBuilds(@Body() body: ItemListDto, @Req() req: Request): Promise<void> {
    const apiKey = req.headers['x-api-key'] as string;
    const serverType = this.secretService.getServerTypeByApiKey(apiKey);
    await this.analyticsService.gameEndItemBuilds(body, serverType);
  }

  /** @deprecated 改由客户端发送，客户端上线确认无误后删除此endpoint */
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
