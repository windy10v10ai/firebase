import { Module } from '@nestjs/common';

import { MembersModule } from '../members/members.module';
import { OrdersModule } from '../orders/orders.module';
import { PlayerModule } from '../player/player.module';
import { PlayerPropertyModule } from '../player-property/player-property.module';

import { PatreonController } from './patreon.controller';
import { PatreonService } from './patreon.service';

@Module({
  imports: [MembersModule, OrdersModule, PlayerModule, PlayerPropertyModule],
  controllers: [PatreonController],
  providers: [PatreonService],
})
export class PatreonModule {}
