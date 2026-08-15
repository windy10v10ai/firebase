import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DailyChallengeRewardDetailDto } from '../../daily-challenge/dto/daily-challenge-reward-detail.dto';

export class PointInfoDto {
  @ApiProperty()
  steamId!: number;
  @ApiProperty()
  title!: {
    cn: string;
    en: string;
  };
  @ApiProperty()
  seasonPoint?: number;
  @ApiProperty()
  memberPoint?: number;
  @ApiPropertyOptional({ type: DailyChallengeRewardDetailDto })
  dailyChallengeReward?: DailyChallengeRewardDetailDto;
}
