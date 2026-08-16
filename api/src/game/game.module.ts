import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { DailyTaskModule } from '../daily-task/daily-task.module';
import { EventRewardsModule } from '../event-rewards/event-rewards.module';
import { LocalHostModule } from '../local-host/local-host.module';
import { MembersModule } from '../members/members.module';
import { PlayerModule } from '../player/player.module';
import { PlayerInfoModule } from '../player-info/player-info.module';

import { GameController } from './game.controller';
import { GameService } from './game.service';

@Module({
  imports: [
    MembersModule,
    PlayerModule,
    PlayerInfoModule,
    EventRewardsModule,
    AnalyticsModule,
    DailyTaskModule,
    LocalHostModule,
  ],
  controllers: [GameController],
  providers: [GameService],
})
export class GameModule {}
