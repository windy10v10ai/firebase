import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { logger } from 'firebase-functions';

import { Public } from '../util/auth/public.decorator';
import { SERVER_TYPE, SecretService } from '../util/secret/secret.service';

import { DailyTaskSnapshotDto } from './dto/daily-task-snapshot.dto';
import { RefreshDailyTaskDto } from './dto/refresh-daily-task.dto';
import { DailyTaskService } from './services/daily-task.service';

@ApiTags('DailyTask')
@Controller('daily-task')
export class DailyTaskController {
  constructor(
    private readonly dailyTaskService: DailyTaskService,
    private readonly secretService: SecretService,
  ) {}

  /** 自行校验 api key：默认守卫不接受本地服务器的 key，而本地对局同样计入每日任务 */
  @Public()
  @ApiBody({ type: RefreshDailyTaskDto })
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDailyTaskDto,
    @Req() req: Request,
  ): Promise<DailyTaskSnapshotDto> {
    const apiKey = req.headers['x-api-key'] as string;
    if (this.secretService.getServerTypeByApiKey(apiKey) === SERVER_TYPE.UNKNOWN) {
      logger.warn('daily-task/refresh: unknown server type', { steamId: dto.steamId });
      throw new UnauthorizedException();
    }

    return this.dailyTaskService.refresh(dto.steamId, dto.dayId);
  }
}
