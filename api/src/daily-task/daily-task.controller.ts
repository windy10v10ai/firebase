import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';

import { AllowLocal } from '../util/auth/allow-local.decorator';
import { AllowWeb } from '../util/auth/allow-web.decorator';

import { DailyTaskSnapshotDto } from './dto/daily-task-snapshot.dto';
import { RefreshDailyTaskBodyDto, RefreshDailyTaskDto } from './dto/refresh-daily-task.dto';
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

  // 网站单独一条：guard 只比对路由上的 :steamId，body 里的 steamId 不受校验，
  // 上面那条挂 @AllowWeb() 等于任何登录玩家都能刷新别人的任务
  @AllowWeb()
  @ApiBody({ type: RefreshDailyTaskBodyDto })
  @Post(':steamId/refresh')
  async refreshForWeb(
    @Param('steamId', ParseIntPipe) steamId: number,
    @Body() dto: RefreshDailyTaskBodyDto,
  ): Promise<DailyTaskSnapshotDto> {
    return this.dailyTaskService.refresh(steamId, dto.dayId);
  }
}
