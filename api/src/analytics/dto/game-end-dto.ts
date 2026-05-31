import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { EventBaseDto } from './event-base-dto';

export class GameEndGameOptionsDto {
  @ApiProperty({ default: 1 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  multiplierRadiant: number;
  @ApiProperty({ default: 1 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  multiplierDire: number;
  @ApiProperty({ default: 1 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  playerNumberRadiant: number;
  @ApiProperty({ default: 1 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  playerNumberDire: number;
  @ApiProperty({ default: 100 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  towerPowerPct: number;
  @ApiProperty({ required: false, default: 100 })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  respawnTime?: number;
}

export class GameEndPlayerDto {
  @ApiProperty({ default: 'npc_dota_hero_abaddon' })
  @IsString()
  @IsNotEmpty()
  heroName: string;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  steamId: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  teamId: number;
  @ApiProperty()
  @IsBoolean()
  isDisconnected: boolean;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  level: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  totalGoldEarned: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  kills: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  deaths: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  assists: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  score: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  battlePoints: number;

  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  lastHits: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  heroDamage: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  damageTaken: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  healing: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  towerKills: number;
}

export class GameEndDto extends EventBaseDto {
  @ApiProperty({ type: GameEndGameOptionsDto })
  @ValidateNested()
  @Type(() => GameEndGameOptionsDto)
  gameOptions: GameEndGameOptionsDto;
  @ApiProperty({ default: 2 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  winnerTeamId: number;
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  gameTimeMsec: number;
  @ApiProperty({ type: [GameEndPlayerDto], maxLength: 20 })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GameEndPlayerDto)
  players: GameEndPlayerDto[];
  @ApiProperty()
  @IsOptional()
  @IsString()
  countryCode?: string;
}
