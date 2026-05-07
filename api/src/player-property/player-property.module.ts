import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { PlayerProperty } from './entities/player-property.entity';
import { PlayerPropertyService } from './player-property.service';

@Module({
  imports: [FireormModule.forFeature([PlayerProperty])],
  controllers: [],
  providers: [PlayerPropertyService],
  exports: [PlayerPropertyService],
})
export class PlayerPropertyModule {}
