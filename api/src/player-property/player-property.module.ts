import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { PlayerProperty } from './entities/player-property.entity';
import { PlayerPropertyService } from './player-property.service';

/**
 * @deprecated 此 Module 将在未来版本中移除，请使用 PlayerPropertyV2Module 替代
 */
@Module({
  imports: [FireormModule.forFeature([PlayerProperty])],
  controllers: [],
  providers: [PlayerPropertyService],
  exports: [PlayerPropertyService],
})
export class PlayerPropertyModule {}
