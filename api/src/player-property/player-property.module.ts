import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { PlayerModule } from '../player/player.module';

import { PlayerProperty } from './entities/player-property.entity';
import { PlayerPropertyService } from './player-property.service';

@Module({
  imports: [FireormModule.forFeature([PlayerProperty]), PlayerModule],
  controllers: [],
  providers: [PlayerPropertyService],
  exports: [PlayerPropertyService],
})
export class PlayerPropertyModule {}
