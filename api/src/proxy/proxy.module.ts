import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { DailyTaskModule } from '../daily-task/daily-task.module';
import { GameModule } from '../game/game.module';
import { LocalHostModule } from '../local-host/local-host.module';
import { PlayerModule } from '../player/player.module';
import { PlayerInfoModule } from '../player-info/player-info.module';

import { ProxyController } from './proxy.controller';

@Module({
  imports: [
    AnalyticsModule,
    DailyTaskModule,
    GameModule,
    PlayerInfoModule,
    PlayerModule,
    LocalHostModule,
  ],
  controllers: [ProxyController],
})
export class ProxyModule {}
