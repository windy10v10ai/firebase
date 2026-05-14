import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { SecretService } from '../util/secret/secret.service';

import { AnalyticsService } from './analytics.service';
import { PlayerLanguageListDto } from './dto/player-language-dto';

@ApiTags('Analytics(GA4)')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly secretService: SecretService,
  ) {}

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
