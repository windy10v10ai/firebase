import { ApiProperty } from '@nestjs/swagger';

export class EventBaseDto {
  @ApiProperty()
  steamAccountId: number;
  @ApiProperty()
  matchId: number;
}
