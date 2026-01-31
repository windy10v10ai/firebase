import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { EventRewardsModule } from '../event-rewards/event-rewards.module';
import { MembersModule } from '../members/members.module';
import { PlayerModule } from '../player/player.module';
import { PlayerInfoModule } from '../player-info/player-info.module';
import { PlayerPropertyModule } from '../player-property/player-property.module';

import { GameController } from './game.controller';
import { GameService } from './game.service';

@Module({
  imports: [
    MembersModule,
    PlayerModule,
    PlayerInfoModule,
    PlayerPropertyModule, // 保留：GameController 的 addPlayerProperty 方法需要
    EventRewardsModule,
    AnalyticsModule,
  ],
  controllers: [GameController],
  providers: [GameService],
})
export class GameModule {}
