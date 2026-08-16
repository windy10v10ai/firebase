import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { DailyTaskModule } from '../daily-task/daily-task.module';
import { PlayerModule } from '../player/player.module';

import { LocalRateLimit } from './entities/local-rate-limit.entity';
import { LocalHostService } from './local-host.service';

@Module({
  imports: [FireormModule.forFeature([LocalRateLimit]), PlayerModule, DailyTaskModule],
  providers: [LocalHostService],
  exports: [LocalHostService],
})
export class LocalHostModule {}
