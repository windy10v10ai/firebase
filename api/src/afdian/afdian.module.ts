import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { Order } from '../orders/entities/order.entity';
import { PlayerModule } from '../player/player.module';

import { MembersModule } from './../members/members.module';
import { AfdianController } from './afdian.controller';
import { AfdianService } from './afdian.service';
import { AfdianOrder } from './entities/afdian-order.entity';
import { AfdianUser } from './entities/afdian-user.entity';

@Module({
  imports: [
    FireormModule.forFeature([Order, AfdianUser, AfdianOrder]),
    MembersModule,
    PlayerModule,
  ],
  controllers: [AfdianController],
  providers: [AfdianService],
  exports: [AfdianService],
})
export class AfdianModule {}
