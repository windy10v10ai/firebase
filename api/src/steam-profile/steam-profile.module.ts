import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { SteamProfile } from './entities/steam-profile.entity';
import { SteamProfileApiService } from './steam-profile.api.service';
import { SteamProfileController } from './steam-profile.controller';
import { SteamProfileService } from './steam-profile.service';

@Module({
  imports: [FireormModule.forFeature([SteamProfile])],
  controllers: [SteamProfileController],
  providers: [SteamProfileService, SteamProfileApiService],
  exports: [SteamProfileService, SteamProfileApiService],
})
export class SteamProfileModule {}
