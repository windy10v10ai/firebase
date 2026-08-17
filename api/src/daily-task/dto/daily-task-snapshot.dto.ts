import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TaskMetric, TaskScope } from '../types/daily-task.types';

export class TaskCandidateDto {
  @ApiProperty()
  taskId: string;
  @ApiProperty({ enum: TaskScope })
  scope: TaskScope;
  @ApiProperty({ enum: TaskMetric })
  metric: TaskMetric;
  @ApiPropertyOptional()
  heroName?: string;
  @ApiProperty()
  star: number;
  @ApiProperty()
  target: number;
  @ApiProperty()
  rewardSeasonPoint: number;
}

export class DailyTaskHistoryEntryDto {
  @ApiProperty()
  dayId: string;
  @ApiProperty({ type: [TaskCandidateDto] })
  tasks: TaskCandidateDto[];
  @ApiProperty()
  seasonPoint: number;
}

export class DailyTaskSnapshotDto {
  @ApiProperty()
  steamId: number;
  @ApiProperty()
  dayId: string;
  @ApiProperty({ type: [TaskCandidateDto] })
  candidates: TaskCandidateDto[];
  @ApiProperty({ type: [TaskCandidateDto] })
  completedTasks: TaskCandidateDto[];
  @ApiProperty()
  todaySeasonPoint: number;
  @ApiProperty({ type: [DailyTaskHistoryEntryDto] })
  history: DailyTaskHistoryEntryDto[];
}
