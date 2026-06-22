import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';
import { PlayerModule } from '../player/player.module';

import { PlayerHeroAwakening } from './entities/player-hero-awakening.entity';
import { PlayerHeroAwakeningService } from './player-hero-awakening.service';

@Module({
  imports: [FireormModule.forFeature([PlayerHeroAwakening]), PlayerModule, AnalyticsModule],
  controllers: [],
  providers: [PlayerHeroAwakeningService],
  exports: [PlayerHeroAwakeningService],
})
export class PlayerHeroAwakeningModule {}
