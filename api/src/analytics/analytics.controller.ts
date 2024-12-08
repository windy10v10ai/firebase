import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AnalyticsService } from './analytics.service';
import { PickDto } from './dto/pick-ability-dto';

@ApiTags('Analytics(GA4)')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('/pick/ability')
  async pickAbility(@Body() body: PickDto) {
    await this.analyticsService.pickAbility(body);
  }
}
