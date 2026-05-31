import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

import { EventBaseDto } from './event-base-dto';

export class GameEndGameOptionsDto {
  @ApiProperty({ default: 1, required: false })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  multiplierRadiant?: number;
  @ApiProperty({ default: 1, required: false })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  multiplierDire?: number;
  @ApiProperty({ default: 1, required: false })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  playerNumberRadiant?: number;
  @ApiProperty({ default: 1, required: false })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  playerNumberDire?: number;
  @ApiProperty({ default: 100, required: false })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  towerPowerPct?: number;
  /** 复活时间百分比；客户端上线后发送，未传则不参与刷分判断 */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  respawnTimePct?: number;
}

export class GameEndPlayerDto {
  @ApiProperty({ default: 'npc_dota_hero_abaddon' })
  heroName: string;
  @ApiProperty()
  steamId: number;
  @ApiProperty()
  teamId: number;
  @ApiProperty()
  isDisconnected: boolean;
  @ApiProperty()
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
  score: number;
  @ApiProperty()
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
  winnerTeamId: number;
  @ApiProperty()
  gameTimeMsec: number;
  @ApiProperty({ type: [GameEndPlayerDto], maxLength: 20 })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GameEndPlayerDto)
  players: GameEndPlayerDto[];
  @ApiProperty()
  countryCode?: string;
}
