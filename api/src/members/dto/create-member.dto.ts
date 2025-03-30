import { ApiProperty } from '@nestjs/swagger';

import { MemberLevel } from '../entities/members.entity';

export class CreateMemberDto {
  @ApiProperty()
  steamId!: number;
  @ApiProperty()
  month!: number;
  @ApiProperty({ enum: MemberLevel })
  level!: MemberLevel;
}
