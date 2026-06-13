import { Module } from '@nestjs/common';

import { AnalyticsPurchaseService } from './analytics.purchase.service';
import { AnalyticsService } from './analytics.service';

@Module({
  providers: [AnalyticsService, AnalyticsPurchaseService],
  exports: [AnalyticsService, AnalyticsPurchaseService],
})
export class AnalyticsModule {}
