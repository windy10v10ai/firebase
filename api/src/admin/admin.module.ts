import { Module } from '@nestjs/common';

import { AfdianModule } from '../afdian/afdian.module';
import { MembersModule } from '../members/members.module';
import { PlayerPropertyModule } from '../player-property/player-property.module';

import { AdminController } from './admin.controller';

@Module({
  imports: [MembersModule, AfdianModule, PlayerPropertyModule],
  controllers: [AdminController],
})
export class AdminModule {}
