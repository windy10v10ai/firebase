import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, Min } from 'class-validator';

import { MemberLevel } from '../entities/members.entity';

export class CreateMemberDto {
  @ApiProperty()
  @IsNumber()
  steamId!: number;
  @ApiProperty()
  @IsNumber()
  @Min(1)
  month!: number;
  @ApiProperty({ enum: MemberLevel })
  @IsEnum(MemberLevel)
  level!: MemberLevel;
}
