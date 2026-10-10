import { Module } from '@nestjs/common';

import { AlipayModule } from '../alipay/alipay.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DailyTaskModule } from '../daily-task/daily-task.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { GameModule } from '../game/game.module';
import { LocalHostModule } from '../local-host/local-host.module';
import { PlayerModule } from '../player/player.module';
import { PlayerInfoModule } from '../player-info/player-info.module';

import { ProxyController } from './proxy.controller';

@Module({
  imports: [
    AlipayModule,
    AnalyticsModule,
    DailyTaskModule,
    FeedbackModule,
    GameModule,
    PlayerInfoModule,
    PlayerModule,
    LocalHostModule,
  ],
  controllers: [ProxyController],
})
export class ProxyModule {}
