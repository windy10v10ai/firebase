import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DailyChallengePlayerSnapshotDto } from '../../daily-challenge/dto/daily-challenge-player-snapshot.dto';
import { PlayerInfoDto } from '../../player-info/dto/player-info.dto';

import { GA4ConfigDto } from './ga4-config.dto';
import { PointInfoDto } from './point-info.dto';

export class GameStart {
  @ApiProperty()
  players!: PlayerInfoDto[];
  @ApiProperty()
  pointInfo!: PointInfoDto[];
  @ApiPropertyOptional({
    description: 'Server-recorded UTC time for daily challenge match attribution',
  })
  matchStartedAt?: string;
  @ApiPropertyOptional({ type: [DailyChallengePlayerSnapshotDto] })
  dailyChallenges?: DailyChallengePlayerSnapshotDto[];
  @ApiPropertyOptional({ description: 'GA4 configuration (only for official servers)' })
  ga4Config?: GA4ConfigDto;
}
