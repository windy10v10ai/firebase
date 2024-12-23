import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { PlayerRank } from './entities/player-rank.entity';
import { PlayerCountController } from './player-count.controller';
import { PlayerCountService } from './player-count.service';

@Module({
  imports: [FireormModule.forFeature([PlayerRank])],
  controllers: [PlayerCountController],
  providers: [PlayerCountService],
  exports: [PlayerCountService],
})
export class PlayerCountModule {}
