import { Module } from '@nestjs/common';

import { PlayerModule } from '../player/player.module';

import { MembersModule } from './../members/members.module';
import { OrdersModule } from './../orders/orders.module';
import { AfdianController } from './afdian.controller';
import { AfdianService } from './afdian.service';

@Module({
  imports: [MembersModule, OrdersModule, PlayerModule],
  controllers: [AfdianController],
  providers: [AfdianService],
})
export class AfdianModule {}
