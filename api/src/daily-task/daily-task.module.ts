import { Module } from '@nestjs/common';
import { FireormModule } from 'nestjs-fireorm';

import { DailyTaskController } from './daily-task.controller';
import { PlayerDailyTask } from './entities/player-daily-task.entity';
import { DailyTaskGenerationService } from './services/daily-task-generation.service';
import { DailyTaskService } from './services/daily-task.service';
import { DailyTaskStore } from './services/daily-task.store';

@Module({
  imports: [FireormModule.forFeature([PlayerDailyTask])],
  controllers: [DailyTaskController],
  providers: [DailyTaskGenerationService, DailyTaskService, DailyTaskStore],
  exports: [DailyTaskService],
})
export class DailyTaskModule {}
