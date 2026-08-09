import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsInt, IsNotEmpty, IsString, Matches } from 'class-validator';

import { DAILY_CHALLENGE_SNAPSHOT_VERSION } from '../types/daily-challenge.types';

export class RefreshDailyChallengeDto {
  @ApiProperty({ example: DAILY_CHALLENGE_SNAPSHOT_VERSION })
  @IsInt()
  @Equals(DAILY_CHALLENGE_SNAPSHOT_VERSION)
  schemaVersion: typeof DAILY_CHALLENGE_SNAPSHOT_VERSION;

  @ApiProperty() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) dayId: string;
  @ApiProperty() @IsString() @IsNotEmpty() requestId: string;
}
