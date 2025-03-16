import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class PlayerLanguageDto {
  @ApiProperty()
  @IsNotEmpty()
  steamId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  language: string;
}

export class PlayerLanguageListDto {
  @ApiProperty({ type: [PlayerLanguageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerLanguageDto)
  players: PlayerLanguageDto[];
}
