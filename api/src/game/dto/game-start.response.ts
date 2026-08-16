import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DailyTaskSnapshotDto } from '../../daily-task/dto/daily-task-snapshot.dto';
import { PlayerInfoDto } from '../../player-info/dto/player-info.dto';

import { GA4ConfigDto } from './ga4-config.dto';
import { PointInfoDto } from './point-info.dto';

export class GameStart {
  @ApiProperty()
  players!: PlayerInfoDto[];
  @ApiProperty()
  pointInfo!: PointInfoDto[];
  @ApiPropertyOptional({ description: 'GA4 configuration (only for official servers)' })
  ga4Config?: GA4ConfigDto;
  @ApiPropertyOptional({ type: [DailyTaskSnapshotDto] })
  dailyTasks?: DailyTaskSnapshotDto[];
}
