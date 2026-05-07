import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';
import { MembersModule } from '../members/members.module';
import { PlayerModule } from '../player/player.module';
import { SecretModule } from '../util/secret/secret.module';

import { AlipayApiService } from './alipay.api.service';
import { AlipayController } from './alipay.controller';
import { AlipayService } from './alipay.service';
import { AlipayOrder } from './entities/alipay-order.entity';

@Module({
  imports: [
    FireormModule.forFeature([AlipayOrder]),
    SecretModule,
    MembersModule,
    PlayerModule,
    AnalyticsModule,
  ],
  controllers: [AlipayController],
  providers: [AlipayService, AlipayApiService],
  exports: [AlipayService, AlipayApiService],
})
export class AlipayModule {}
