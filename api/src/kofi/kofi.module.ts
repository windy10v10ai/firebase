import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { MembersModule } from '../members/members.module';
import { SecretModule } from '../util/secret/secret.module';

import { Kofi } from './entities/kofi.entity';
import { KofiController } from './kofi.controller';
import { KofiService } from './kofi.service';

@Module({
  imports: [FireormModule.forFeature([Kofi]), MembersModule, SecretModule],
  controllers: [KofiController],
  providers: [KofiService],
})
export class KofiModule {}
