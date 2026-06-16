import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';

import { PlayerConduct } from './entities/player-conduct.entity';
import { PlayerRanking } from './entities/player-ranking.entity';
import { PlayerSetting } from './entities/player-setting.entity';
import { PlayerStatsLifetime } from './entities/player-stats-lifetime.entity';
import { Player } from './entities/player.entity';
import { PlayerConductService } from './player-conduct.service';
import { PlayerGamePresetService } from './player-game-preset.service';
import { PlayerRankingService } from './player-ranking.service';
import { PlayerSettingService } from './player-setting.service';
import { PlayerStatsLifetimeService } from './player-stats-lifetime.service';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [
    FireormModule.forFeature([
      Player,
      PlayerRanking,
      PlayerSetting,
      PlayerConduct,
      PlayerStatsLifetime,
    ]),
    AnalyticsModule,
  ],
  controllers: [PlayerController],
  providers: [
    PlayerService,
    PlayerRankingService,
    PlayerSettingService,
    PlayerConductService,
    PlayerStatsLifetimeService,
    PlayerGamePresetService,
  ],
  exports: [
    PlayerService,
    PlayerRankingService,
    PlayerSettingService,
    PlayerConductService,
    PlayerStatsLifetimeService,
    PlayerGamePresetService,
  ],
})
export class PlayerModule {}
