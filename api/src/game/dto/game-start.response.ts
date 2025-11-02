import { ApiProperty } from '@nestjs/swagger';

import { MemberDto } from '../../members/dto/member.dto';
import { Player } from '../../player/entities/player.entity';

import { GA4ConfigDto } from './ga4-config.dto';
import { PointInfoDto } from './point-info.dto';

export class GameStart {
  @ApiProperty()
  members: MemberDto[];
  @ApiProperty()
  players: Player[];
  @ApiProperty()
  pointInfo?: PointInfoDto[];
  @ApiProperty({ required: false, description: 'GA4 configuration (only for official servers)' })
  ga4Config?: GA4ConfigDto;
}
