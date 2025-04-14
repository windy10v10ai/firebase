import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';

import { PlayerRanking } from './entities/player-ranking.entity';
import { PlayerSetting } from './entities/player-setting.entity';
import { Player } from './entities/player.entity';
import { PlayerRankingService } from './player-ranking.service';
import { PlayerSettingService } from './player-setting.service';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [FireormModule.forFeature([Player, PlayerRanking, PlayerSetting]), AnalyticsModule],
  controllers: [PlayerController],
  providers: [PlayerService, PlayerRankingService, PlayerSettingService],
  exports: [PlayerService, PlayerRankingService, PlayerSettingService],
})
export class PlayerModule {}
