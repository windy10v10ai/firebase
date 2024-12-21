import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';
import { PlayerModule } from '../player/player.module';

import { MembersModule } from './../members/members.module';
import { AfdianController } from './afdian.controller';
import { AfdianService } from './afdian.service';
import { AfdianOrder } from './entities/afdian-order.entity';
import { AfdianUser } from './entities/afdian-user.entity';

@Module({
  imports: [
    FireormModule.forFeature([AfdianUser, AfdianOrder]),
    MembersModule,
    PlayerModule,
    AnalyticsModule,
  ],
  controllers: [AfdianController],
  providers: [AfdianService],
  exports: [AfdianService],
})
export class AfdianModule {}
