import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';
import { PlayerModule } from '../player/player.module';

import { PlayerProperty } from './entities/player-property.entity';
import { PlayerPropertyService } from './player-property.service';

@Module({
  imports: [FireormModule.forFeature([PlayerProperty]), PlayerModule, AnalyticsModule],
  controllers: [],
  providers: [PlayerPropertyService],
  exports: [PlayerPropertyService],
})
export class PlayerPropertyModule {}
