import { ApiProperty } from '@nestjs/swagger';

import { CheckInPointsDto } from '../../members/dto/check-in-points.dto';

import { PlayerInfoDto } from './player-info.dto';

// 按积分种类分组，以后新增的积分是多一个键，不改已有字段
export class PlayerCheckInDto {
  @ApiProperty()
  memberPoint: CheckInPointsDto;
}

export class CheckInResultDto extends PlayerCheckInDto {
  @ApiProperty()
  player: PlayerInfoDto;
}
