import { ApiProperty } from '@nestjs/swagger';

import { DailyChallengeRewardSource } from '../types/daily-challenge.types';

export class DailyChallengeGameEndRewardDto {
  @ApiProperty()
  steamId: number;

  @ApiProperty({ enum: DailyChallengeRewardSource })
  source: DailyChallengeRewardSource;

  @ApiProperty()
  seasonPoint: number;

  @ApiProperty()
  dayId: string;

  @ApiProperty()
  assignmentId: string;
}
