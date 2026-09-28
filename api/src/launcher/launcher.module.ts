import { Module } from '@nestjs/common';

import { LauncherReleaseService } from './launcher-release.service';
import { LauncherWorkshopService } from './launcher-workshop.service';
import { LauncherController } from './launcher.controller';

@Module({
  controllers: [LauncherController],
  providers: [LauncherWorkshopService, LauncherReleaseService],
})
export class LauncherModule {}
