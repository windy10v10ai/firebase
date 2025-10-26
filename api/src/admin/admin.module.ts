import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AfdianModule } from '../afdian/afdian.module';
import { MembersModule } from '../members/members.module';
import { PlayerSetting } from '../player/entities/player-setting.entity';
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
    FireormModule.forFeature([PlayerSetting]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
