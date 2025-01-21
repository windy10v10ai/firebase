import { ApiProperty } from '@nestjs/swagger';

import { MemberDto } from '../../members/dto/member.dto';
import { Player } from '../../player/entities/player.entity';

import { PointInfoDto } from './point-info.dto';

export class GameStart {
  @ApiProperty()
  members: MemberDto[];
  @ApiProperty()
  players: Player[];
  @ApiProperty()
  top100SteamIds: string[];
  @ApiProperty()
  pointInfo?: PointInfoDto[];
}
