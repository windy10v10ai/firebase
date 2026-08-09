import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  ChallengeMetric,
  DAILY_CHALLENGE_MATCH_DATA_VERSION,
  DAILY_CHALLENGE_SNAPSHOT_VERSION,
} from '../types/daily-challenge.types';

export class DailyChallengeMetricContributionDto {
  @ApiProperty({ enum: ChallengeMetric }) @IsEnum(ChallengeMetric) metric: ChallengeMetric;
  @ApiProperty() @IsInt() @Min(0) value: number;
}

export class DailyChallengePlayerContributionDto {
  @ApiProperty() @IsInt() @Min(1) steamId: number;
  @ApiProperty() @IsBoolean() normallySettled: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() acceptedAssignmentId?: string;

  @ApiProperty({ type: [DailyChallengeMetricContributionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyChallengeMetricContributionDto)
  personalMetrics: DailyChallengeMetricContributionDto[];

  @ApiProperty({ type: [DailyChallengeMetricContributionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyChallengeMetricContributionDto)
  globalMetrics: DailyChallengeMetricContributionDto[];
}

export class DailyChallengeMatchContributionDto {
  @ApiProperty({ example: DAILY_CHALLENGE_SNAPSHOT_VERSION })
  @IsInt()
  @Equals(DAILY_CHALLENGE_SNAPSHOT_VERSION)
  schemaVersion: typeof DAILY_CHALLENGE_SNAPSHOT_VERSION;

  @ApiProperty({ maximum: DAILY_CHALLENGE_MATCH_DATA_VERSION })
  @IsInt()
  @Min(1)
  @Max(DAILY_CHALLENGE_MATCH_DATA_VERSION)
  dataVersion: number;
  @ApiProperty() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) dayId: string;
  @ApiProperty() @IsDateString() matchStartedAt: string;

  @ApiProperty({ type: [DailyChallengePlayerContributionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyChallengePlayerContributionDto)
  players: DailyChallengePlayerContributionDto[];
}
