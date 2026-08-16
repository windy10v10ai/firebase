import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { DailyTaskModule } from '../daily-task/daily-task.module';
import { PlayerModule } from '../player/player.module';

import { LocalSettlementRateLimit } from './entities/local-settlement-rate-limit.entity';
import { LocalSettlementService } from './local-settlement.service';

@Module({
  imports: [FireormModule.forFeature([LocalSettlementRateLimit]), PlayerModule, DailyTaskModule],
  providers: [LocalSettlementService],
  exports: [LocalSettlementService],
})
export class LocalSettlementModule {}
