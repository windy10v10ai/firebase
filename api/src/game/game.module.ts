import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { CountModule } from '../count/count.module';
import { EventRewardsModule } from '../event-rewards/event-rewards.module';
import { MembersModule } from '../members/members.module';
import { PlayerModule } from '../player/player.module';
import { PlayerCountModule } from '../player-count/player-count.module';
import { PlayerPropertyModule } from '../player-property/player-property.module';

import { GameController } from './game.controller';
import { GameService } from './game.service';

@Module({
  imports: [
    MembersModule,
    PlayerCountModule,
    CountModule,
    PlayerModule,
    PlayerPropertyModule,
    EventRewardsModule,
    AnalyticsModule,
  ],
  controllers: [GameController],
  providers: [GameService],
})
export class GameModule {}
