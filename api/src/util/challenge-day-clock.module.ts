import { Module } from '@nestjs/common';

import { ChallengeDayClockService } from './challenge-day-clock.service';

@Module({
  providers: [ChallengeDayClockService],
  exports: [ChallengeDayClockService],
})
export class ChallengeDayClockModule {}
