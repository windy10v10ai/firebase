import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { CountController } from './count.controller';
import { CountService } from './count.service';
import { CountDifficult } from './entities/count-difficult.entity';

@Module({
  imports: [FireormModule.forFeature([CountDifficult])],
  controllers: [CountController],
  providers: [CountService],
  exports: [CountService],
})
export class CountModule {}
