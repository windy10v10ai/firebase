import { Module } from '@nestjs/common';

import { MembersModule } from '../members/members.module';
import { PlayerModule } from '../player/player.module';
import { PlayerPropertyModule } from '../player-property/player-property.module';

import { PlayerInfoService } from './player-info.service';

@Module({
  imports: [PlayerModule, MembersModule, PlayerPropertyModule],
  controllers: [], // Phase 1: 无 Controller
  providers: [PlayerInfoService],
  exports: [PlayerInfoService],
})
export class PlayerInfoModule {}
