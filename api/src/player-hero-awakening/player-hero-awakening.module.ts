import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';
import { PlayerModule } from '../player/player.module';

import { PlayerHeroAwakening } from './entities/player-hero-awakening.entity';
import { PlayerHeroAwakeningCompensationService } from './player-hero-awakening-compensation.service';
import { PlayerHeroAwakeningService } from './player-hero-awakening.service';

@Module({
  imports: [FireormModule.forFeature([PlayerHeroAwakening]), PlayerModule, AnalyticsModule],
  controllers: [],
  // TODO: PlayerHeroAwakeningCompensationService 是一次性迁移，随机觉醒上线执行完后删除
  providers: [PlayerHeroAwakeningService, PlayerHeroAwakeningCompensationService],
  exports: [PlayerHeroAwakeningService, PlayerHeroAwakeningCompensationService],
})
export class PlayerHeroAwakeningModule {}
