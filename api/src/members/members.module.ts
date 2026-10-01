import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { BigQueryModule } from '../bigquery/bigquery.module';
import { PlayerModule } from '../player/player.module';

import { Member } from './entities/members.entity';
import { MembersService } from './members.service';

@Module({
  imports: [FireormModule.forFeature([Member]), PlayerModule, BigQueryModule],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
