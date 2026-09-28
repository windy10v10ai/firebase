import { Module } from '@nestjs/common';

import { LauncherWorkshopService } from './launcher-workshop.service';
import { LauncherController } from './launcher.controller';

@Module({
  controllers: [LauncherController],
  providers: [LauncherWorkshopService],
})
export class LauncherModule {}
