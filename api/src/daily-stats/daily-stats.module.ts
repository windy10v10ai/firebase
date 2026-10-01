import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { DailyStat } from './daily-stat.entity';
import { DailyStatsService } from './daily-stats.service';

@Module({
  imports: [FireormModule.forFeature([DailyStat])],
  providers: [DailyStatsService],
  exports: [DailyStatsService],
})
export class DailyStatsModule {}
