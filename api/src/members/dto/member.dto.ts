import { ApiProperty } from '@nestjs/swagger';

import { Member, MemberLevel } from '../entities/members.entity';
import { MembersService } from '../members.service';

export class MemberDto {
  @ApiProperty()
  steamId!: number;
  @ApiProperty()
  enable!: boolean;
  @ApiProperty()
  expireDateString!: string;
  @ApiProperty({ enum: MemberLevel })
  level!: MemberLevel;

  constructor(member: Member) {
    this.steamId = member.steamId;
    // 有效期次日UTC 00:00后 过期
    this.enable = MembersService.IsMemberEnable(member);
    this.expireDateString = member.expireDate.toISOString().split('T')[0];
    this.level = member.level;
  }
}
