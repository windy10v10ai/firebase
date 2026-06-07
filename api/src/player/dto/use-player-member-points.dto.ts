import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class UsePlayerMemberPointsDto {
  @ApiProperty()
  @IsNumber()
  steamId: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  memberPoint: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason: string;
}
