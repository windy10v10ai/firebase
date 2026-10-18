import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';
import { MembersModule } from '../members/members.module';
import { PlayerModule } from '../player/player.module';
import { SecretModule } from '../util/secret/secret.module';

import { StripeOrder } from './entities/stripe-order.entity';
import { StripeApiService } from './stripe.api.service';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';

@Module({
  imports: [
    FireormModule.forFeature([StripeOrder]),
    SecretModule,
    MembersModule,
    PlayerModule,
    AnalyticsModule,
  ],
  controllers: [StripeController],
  providers: [StripeService, StripeApiService],
})
export class StripeModule {}
