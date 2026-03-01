import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AfdianModule } from '../afdian/afdian.module';
import { KofiOrder } from '../kofi/entities/kofi-order.entity';
import { KofiUser } from '../kofi/entities/kofi-user.entity';
import { KofiModule } from '../kofi/kofi.module';
import { MembersModule } from '../members/members.module';
import { PlayerModule } from '../player/player.module';
import { PlayerPropertyModule } from '../player-property/player-property.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    MembersModule,
    PlayerModule,
    PlayerPropertyModule,
    AfdianModule,
    KofiModule,
    FireormModule.forFeature([KofiUser, KofiOrder]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
