import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';

import { AllowLocal } from '../util/auth/allow-local.decorator';
import { AllowWeb } from '../util/auth/allow-web.decorator';

import { DailyTaskSnapshotDto } from './dto/daily-task-snapshot.dto';
import { RefreshDailyTaskDto } from './dto/refresh-daily-task.dto';
import { DailyTaskService } from './services/daily-task.service';

@ApiTags('DailyTask')
@Controller('daily-task')
export class DailyTaskController {
  constructor(private readonly dailyTaskService: DailyTaskService) {}

  @AllowLocal()
  @AllowWeb()
  @Get(':steamId')
  async getSnapshot(
    @Param('steamId', ParseIntPipe) steamId: number,
  ): Promise<DailyTaskSnapshotDto> {
    return this.dailyTaskService.getSnapshotWithHistory(steamId);
  }

  @AllowLocal()
  @ApiBody({ type: RefreshDailyTaskDto })
  @Post('refresh')
  async refresh(@Body() dto: RefreshDailyTaskDto): Promise<DailyTaskSnapshotDto> {
    return this.dailyTaskService.refresh(dto.steamId, dto.dayId);
  }
}
