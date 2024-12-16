import { ApiProperty } from '@nestjs/swagger';

import { PlayerEventBaseDto } from './event-base-dto';

export class PickDto extends PlayerEventBaseDto {
  @ApiProperty({ default: 'name' })
  name: string;
  @ApiProperty()
  level: number;
}
