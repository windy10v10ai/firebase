import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { Member } from './entities/members.entity';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [FireormModule.forFeature([Member])],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
