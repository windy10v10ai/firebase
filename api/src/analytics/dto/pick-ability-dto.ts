import { ApiProperty } from '@nestjs/swagger';

import { EventBaseDto } from './event-base-dto';

export class PickDto extends EventBaseDto {
  @ApiProperty({ default: 'name' })
  name: string;
  @ApiProperty()
  level: number;
  @ApiProperty()
  difficulty: number;
  @ApiProperty({ default: 'v4.00' })
  version: string;
}
