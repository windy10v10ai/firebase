import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
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
  ChallengeDayStatus,
  DAILY_CHALLENGE_SNAPSHOT_VERSION,
} from '../types/daily-challenge.types';

import { DailyChallengeRewardHistoryDto } from './daily-challenge-reward-history.dto';
import { DailyChallengeTaskSnapshotDto } from './daily-challenge-task-snapshot.dto';

export class DailyChallengeGlobalRewardTiersDto {
  @ApiProperty() @IsInt() @Min(1) topPercent: number;
  @ApiProperty() @IsInt() @Min(1) middlePercent: number;
  @ApiProperty() @IsInt() @Min(1) topRewardSeasonPoint: number;
  @ApiProperty() @IsInt() @Min(1) middleRewardSeasonPoint: number;
  @ApiProperty() @IsInt() @Min(1) baseRewardSeasonPoint: number;
}
export class DailyChallengeRefreshStateDto {
  @ApiProperty() @IsBoolean() isMember: boolean;
  @ApiProperty() @IsBoolean() freeRefreshAvailable: boolean;
  @ApiProperty() @IsInt() @Min(0) paidRefreshesUsed: number;
  @ApiProperty() @IsInt() @Min(0) paidRefreshesRemaining: number;
  @ApiProperty() @IsInt() @Min(0) nextCostMemberPoint: number;
}

export class DailyChallengeStreakStateDto {
  @ApiProperty() @IsInt() @Min(0) currentDays: number;
  @ApiProperty() @IsInt() @Min(1) cycleTargetDays: number;
  @ApiProperty() @IsInt() @Min(1) nextMilestoneDays: number;
  @ApiProperty() @IsInt() @Min(1) nextMilestoneRewardSeasonPoint: number;
}

export class DailyChallengePlayerSnapshotDto {
  @ApiProperty({ example: DAILY_CHALLENGE_SNAPSHOT_VERSION })
  @IsInt()
  @Equals(DAILY_CHALLENGE_SNAPSHOT_VERSION)
  schemaVersion: typeof DAILY_CHALLENGE_SNAPSHOT_VERSION;

  @ApiProperty() @IsInt() @Min(1) steamId: number;
  @ApiProperty({ example: '2026-08-04' }) @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) dayId: string;
  @ApiProperty({ enum: ChallengeDayStatus }) @IsEnum(ChallengeDayStatus) status: ChallengeDayStatus;
  @ApiProperty() @IsDateString() startsAt: string;
  @ApiProperty() @IsDateString() endsAt: string;
  @ApiProperty() @IsDateString() updatedAt: string;

  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) totalRounds: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) currentRound: number;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) completedRoundCount: number;

  @ApiProperty({ type: [DailyChallengeTaskSnapshotDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyChallengeTaskSnapshotDto)
  completedTasks: DailyChallengeTaskSnapshotDto[];

  @ApiPropertyOptional({ type: DailyChallengeTaskSnapshotDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DailyChallengeTaskSnapshotDto)
  globalTask?: DailyChallengeTaskSnapshotDto;

  @ApiProperty({ type: DailyChallengeGlobalRewardTiersDto })
  @ValidateNested()
  @Type(() => DailyChallengeGlobalRewardTiersDto)
  globalRewardTiers: DailyChallengeGlobalRewardTiersDto;

  @ApiProperty({ type: [DailyChallengeTaskSnapshotDto], maxItems: 3 })
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => DailyChallengeTaskSnapshotDto)
  candidates: DailyChallengeTaskSnapshotDto[];

  @ApiPropertyOptional({ type: DailyChallengeTaskSnapshotDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DailyChallengeTaskSnapshotDto)
  acceptedTask?: DailyChallengeTaskSnapshotDto;

  @ApiProperty() @IsInt() @Min(0) unreadRewardCount: number;

  @ApiProperty({ type: [DailyChallengeRewardHistoryDto], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DailyChallengeRewardHistoryDto)
  recentRewards: DailyChallengeRewardHistoryDto[];

  @ApiProperty() @IsBoolean() needsSelection: boolean;

  @ApiProperty({ type: DailyChallengeStreakStateDto })
  @ValidateNested()
  @Type(() => DailyChallengeStreakStateDto)
  streak: DailyChallengeStreakStateDto;

  @ApiProperty({ type: DailyChallengeRefreshStateDto })
  @ValidateNested()
  @Type(() => DailyChallengeRefreshStateDto)
  refresh: DailyChallengeRefreshStateDto;
}
