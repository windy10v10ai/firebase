import { Module } from '@nestjs/common';

import { AfdianModule } from '../afdian/afdian.module';

import { TaskController } from './task.controller';

@Module({
  imports: [AfdianModule],
  controllers: [TaskController],
})
export class TaskModule {}
