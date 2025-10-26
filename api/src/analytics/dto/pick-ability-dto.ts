import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, ValidateNested } from 'class-validator';

import { EventBaseDto } from './event-base-dto';

export class PickDto {
  @ApiProperty()
  @IsNotEmpty()
  steamId: number;
  @ApiProperty({ default: 'name' })
  name: string;
  @ApiProperty()
  type: string;
  @ApiProperty()
  level: number;
}

export class PickListDto extends OmitType(EventBaseDto, ['steamId']) {
  @ApiProperty({ type: [PickDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PickDto)
  picks: PickDto[];
}
