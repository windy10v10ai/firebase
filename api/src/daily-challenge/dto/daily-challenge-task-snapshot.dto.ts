import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

import {
  ChallengeMetric,
  ChallengeScope,
  ChallengeUnit,
  DailyChallengePersonalStar,
} from '../types/daily-challenge.types';

export class DailyChallengeTaskSnapshotDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assignmentId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @ApiProperty({ enum: ChallengeScope })
  @IsEnum(ChallengeScope)
  scope: ChallengeScope;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  configVersion: number;

  @ApiPropertyOptional({ enum: [1, 2, 3] })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3])
  star?: DailyChallengePersonalStar;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  round?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalRounds?: number;

  @ApiProperty({ enum: ChallengeMetric })
  @IsEnum(ChallengeMetric)
  metric: ChallengeMetric;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  heroName?: string;

  @ApiProperty({ enum: ChallengeUnit })
  @IsEnum(ChallengeUnit)
  unit: ChallengeUnit;

  @ApiProperty()
  @IsInt()
  @Min(1)
  target: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  progress: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  rewardSeasonPoint: number;
}
