import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AfdianModule } from '../afdian/afdian.module';
import { KofiOrder } from '../kofi/entities/kofi-order.entity';
import { MembersModule } from '../members/members.module';
import { PlayerPropertyModule } from '../player-property/player-property.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    MembersModule,
    AfdianModule,
    PlayerPropertyModule,
    FireormModule.forFeature([KofiOrder]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
