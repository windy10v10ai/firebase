import { ApiProperty } from '@nestjs/swagger';

export class ResetPlayerPropertyDto {
  @ApiProperty()
  steamId: number;
  @ApiProperty()
  useMemberPoint: boolean;
}
