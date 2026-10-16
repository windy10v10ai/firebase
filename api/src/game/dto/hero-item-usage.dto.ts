import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class HeroItemDurationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemName: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  durationSec: number;
}

export class HeroItemUsageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customMatchId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  version: string;

  @ApiProperty()
  @IsInt()
  difficulty: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  dotaTimeMsec: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  playerCount: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  playerId: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  steamId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  heroName: string;

  @ApiProperty()
  @IsInt()
  teamId: number;

  @ApiProperty()
  @IsBoolean()
  isWin: boolean;

  @ApiProperty({ type: [HeroItemDurationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeroItemDurationDto)
  items: HeroItemDurationDto[];
}
