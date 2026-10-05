import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { BigQueryModule } from '../bigquery/bigquery.module';
import { SteamProfileModule } from '../steam-profile/steam-profile.module';
import { SecretModule } from '../util/secret/secret.module';

import { LauncherRoomJoin } from './entities/launcher-room-join.entity';
import { LauncherRoom } from './entities/launcher-room.entity';
import { LauncherRelayService } from './launcher-relay.service';
import { LauncherReleaseService } from './launcher-release.service';
import { LauncherRoomController } from './launcher-room.controller';
import { LauncherRoomService } from './launcher-room.service';
import { LauncherWorkshopService } from './launcher-workshop.service';
import { LauncherController } from './launcher.controller';

@Module({
  imports: [
    FireormModule.forFeature([LauncherRoom, LauncherRoomJoin]),
    BigQueryModule,
    SteamProfileModule,
    SecretModule,
  ],
  controllers: [LauncherController, LauncherRoomController],
  providers: [
    LauncherWorkshopService,
    LauncherReleaseService,
    LauncherRoomService,
    LauncherRelayService,
  ],
})
export class LauncherModule {}
