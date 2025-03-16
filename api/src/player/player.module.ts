import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';

import { PlayerRanking } from './entities/player-ranking.entity';
import { Player } from './entities/player.entity';
import { PlayerRankingService } from './player-ranking.service';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [FireormModule.forFeature([Player, PlayerRanking]), AnalyticsModule],
  controllers: [PlayerController],
  providers: [PlayerService, PlayerRankingService],
  exports: [PlayerService, PlayerRankingService],
})
export class PlayerModule {}
