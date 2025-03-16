import { ApiProperty, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

import { EventBaseDto } from './event-base-dto';

export class PlayerLanguageDto {
  @ApiProperty()
  @IsNotEmpty()
  steamId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  language: string;
}

export class PlayerLanguageListDto extends PickType(EventBaseDto, ['matchId', 'version']) {
  @ApiProperty({ type: [PlayerLanguageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerLanguageDto)
  players: PlayerLanguageDto[];
}
