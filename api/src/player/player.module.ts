import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';

import { PlayerRank } from './entities/player-rank.entity';
import { PlayerRanking } from './entities/player-ranking.entity';
import { Player } from './entities/player.entity';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [FireormModule.forFeature([Player, PlayerRank, PlayerRanking]), AnalyticsModule],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
