import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AnalyticsModule } from '../analytics/analytics.module';
import { MembersModule } from '../members/members.module';
import { PlayerModule } from '../player/player.module';
import { SecretModule } from '../util/secret/secret.module';

import { KofiOrder } from './entities/kofi-order.entity';
import { KofiUser } from './entities/kofi-user.entity';
import { KofiController } from './kofi.controller';
import { KofiService } from './kofi.service';

@Module({
  imports: [
    FireormModule.forFeature([KofiOrder, KofiUser]),
    MembersModule,
    SecretModule,
    PlayerModule,
    AnalyticsModule,
  ],
  controllers: [KofiController],
  providers: [KofiService],
})
export class KofiModule {}
