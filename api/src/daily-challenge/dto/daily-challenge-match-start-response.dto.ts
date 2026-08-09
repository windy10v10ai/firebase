import { ApiProperty } from '@nestjs/swagger';

import { DailyChallengePlayerSnapshotDto } from './daily-challenge-player-snapshot.dto';

export class DailyChallengeMatchStartResponseDto {
  @ApiProperty()
  dayId: string;

  @ApiProperty()
  matchStartedAt: string;

  @ApiProperty({ type: [DailyChallengePlayerSnapshotDto] })
  dailyChallenges: DailyChallengePlayerSnapshotDto[];
}
