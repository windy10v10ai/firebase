import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { PlayerModule } from '../player/player.module';

import { EventReward } from './entities/event-reward.entity';
import { EventRewardsService } from './event-rewards.service';

@Module({
  imports: [FireormModule.forFeature([EventReward]), PlayerModule],
  providers: [EventRewardsService],
  exports: [EventRewardsService],
})
export class EventRewardsModule {}
