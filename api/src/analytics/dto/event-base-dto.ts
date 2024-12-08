import { ApiProperty } from '@nestjs/swagger';

export class EventBaseDto {
  @ApiProperty()
  steamId: number;
  @ApiProperty()
  matchId: string;
}
