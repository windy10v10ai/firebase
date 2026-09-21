import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { GameModule } from '../game/game.module';
import { LocalHostModule } from '../local-host/local-host.module';
import { PlayerInfoModule } from '../player-info/player-info.module';

import { ProxyController } from './proxy.controller';

@Module({
  imports: [AnalyticsModule, GameModule, PlayerInfoModule, LocalHostModule],
  controllers: [ProxyController],
})
export class ProxyModule {}
