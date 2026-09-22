import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';
import { SteamProfileModule } from '../steam-profile/steam-profile.module';

import { PlayerConduct } from './entities/player-conduct.entity';
import { PlayerRanking } from './entities/player-ranking.entity';
import { PlayerSetting } from './entities/player-setting.entity';
import { PlayerStatsLifetime } from './entities/player-stats-lifetime.entity';
import { PlayerStatsRecent } from './entities/player-stats-recent.entity';
import { Player } from './entities/player.entity';
import { PlayerConductService } from './player-conduct.service';
import { PlayerGamePresetService } from './player-game-preset.service';
import { PlayerRankingService } from './player-ranking.service';
import { PlayerSettingService } from './player-setting.service';
import { PlayerStatsLifetimeService } from './player-stats-lifetime.service';
import { PlayerStatsRecentService } from './player-stats-recent.service';
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
      PlayerStatsRecent,
    ]),
    AnalyticsModule,
    SteamProfileModule,
  ],
  controllers: [PlayerController],
  providers: [
    PlayerService,
    PlayerRankingService,
    PlayerSettingService,
    PlayerConductService,
    PlayerStatsLifetimeService,
    PlayerStatsRecentService,
    PlayerGamePresetService,
  ],
  exports: [
    PlayerService,
    PlayerRankingService,
    PlayerSettingService,
    PlayerConductService,
    PlayerStatsLifetimeService,
    PlayerStatsRecentService,
    PlayerGamePresetService,
  ],
})
export class PlayerModule {}
