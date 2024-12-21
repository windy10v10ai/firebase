import { Module } from '@nestjs/common';

import { AnalyticsController } from './analytics.controller';
import { AnalyticsPurchaseService } from './analytics.purchase.service';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsPurchaseService],
  exports: [AnalyticsService, AnalyticsPurchaseService],
})
export class AnalyticsModule {}
