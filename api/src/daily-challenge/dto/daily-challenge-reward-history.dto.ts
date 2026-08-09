import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  DailyChallengeContributionTier,
  DailyChallengeRewardSource,
} from '../types/daily-challenge.types';

import { DailyChallengeTaskSnapshotDto } from './daily-challenge-task-snapshot.dto';

export class DailyChallengeRewardHistoryDto {
  @ApiProperty() @IsString() rewardId: string;
  @ApiProperty() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) dayId: string;
  @ApiProperty({ enum: DailyChallengeRewardSource })
  @IsEnum(DailyChallengeRewardSource)
  source: DailyChallengeRewardSource;
  @ApiProperty() @IsInt() @Min(0) seasonPoint: number;
  @ApiProperty() @IsDateString() createdAt: string;

  @ApiPropertyOptional() @IsOptional() @IsString() configVersionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) configVersion?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() assignmentId?: string;
  @ApiPropertyOptional({ enum: DailyChallengeContributionTier })
  @IsOptional()
  @IsEnum(DailyChallengeContributionTier)
  contributionTier?: DailyChallengeContributionTier;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) streakDays?: number;

  @ApiPropertyOptional({ type: DailyChallengeTaskSnapshotDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DailyChallengeTaskSnapshotDto)
  taskSnapshot?: DailyChallengeTaskSnapshotDto;
}
