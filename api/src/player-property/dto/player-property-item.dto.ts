import { ApiProperty } from '@nestjs/swagger';

export class PlayerPropertyItemDto {
  @ApiProperty()
  name: string;
  @ApiProperty()
  level: number;
}
