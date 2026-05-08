import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MemberDto } from '../../members/dto/member.dto';
import { PlayerInfoDto } from '../../player-info/dto/player-info.dto';

import { GA4ConfigDto } from './ga4-config.dto';
import { PointInfoDto } from './point-info.dto';

export class GameStart {
  // TODO: remove after client migrates to reading member from players[i].member
  @ApiProperty()
  members: MemberDto[];
  @ApiProperty()
  players!: PlayerInfoDto[];
  @ApiProperty()
  pointInfo!: PointInfoDto[];
  @ApiPropertyOptional({ description: 'GA4 configuration (only for official servers)' })
  ga4Config?: GA4ConfigDto;
}
