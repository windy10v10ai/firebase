import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { AfdianModule } from '../afdian/afdian.module';
import { KofiOrder } from '../kofi/entities/kofi-order.entity';
import { MembersModule } from '../members/members.module';
import { PlayerHeroAwakeningModule } from '../player-hero-awakening/player-hero-awakening.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    MembersModule,
    AfdianModule,
    // TODO: 仅为一次性 hero-awakening 补偿迁移端点引入，随机觉醒上线执行完后删除
    PlayerHeroAwakeningModule,
    FireormModule.forFeature([KofiOrder]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
