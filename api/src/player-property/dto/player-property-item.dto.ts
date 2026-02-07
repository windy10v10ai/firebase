import { ApiProperty } from '@nestjs/swagger';

export class PlayerPropertyItemDto {
  @ApiProperty()
  steamId: number;
  @ApiProperty()
  name: string;
  @ApiProperty()
  level: number;
}
