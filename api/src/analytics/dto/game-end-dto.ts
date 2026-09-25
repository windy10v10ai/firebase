import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { EventBaseDto } from './event-base-dto';

export class GameEndGameOptionsDto {
  @ApiProperty({ default: 1 })
  multiplierRadiant: number;
  @ApiProperty({ default: 1 })
  multiplierDire: number;
  @ApiProperty({ default: 1 })
  playerNumberRadiant: number;
  @ApiProperty({ default: 1 })
  playerNumberDire: number;
  @ApiProperty({ default: 100 })
  towerPowerPct: number;
  /** 客户端下一版起发送；未传时不参与刷分判断 */
  @ApiProperty({ required: false })
  respawnTimePct?: number;
}

export class DailyTaskResultDto {
  @ApiProperty()
  @IsString()
  @Matches(/^\d{8}$/)
  dayId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(3)
  star: number;

  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  seasonPoint: number;
}

const ITEM_NAME_MAX_LENGTH = 64;

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

  /** 0 = 未觉醒，1 = 已觉醒；预留扩展，不可断言只有 0/1。旧客户端不发送时按 0 统计 */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  awaken?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stuns?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  roshanKills?: number;

  /**
   * 结算界面那一行的属性、出装与抽选技能，客户端下一版起发送，且只有真人玩家有。
   * 上限用来兜住伪造的请求体，正常客户端碰不到。
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  strength?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  agility?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  intellect?: number;

  /** 定长 6，下标即主物品栏槽位，空槽为空串 */
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(ITEM_NAME_MAX_LENGTH, { each: true })
  items?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(ITEM_NAME_MAX_LENGTH)
  neutralItem?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(ITEM_NAME_MAX_LENGTH)
  neutralPassiveItem?: string;

  /** 顺序为主动、被动 1、被动 2 */
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(ITEM_NAME_MAX_LENGTH, { each: true })
  abilities?: string[];

  @ApiProperty({ type: DailyTaskResultDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => DailyTaskResultDto)
  dailyTask?: DailyTaskResultDto;
}

export class GameEndDto extends EventBaseDto {
  @ApiProperty({ type: GameEndGameOptionsDto })
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
  /** 全场真人数。代发请求每条只带一个玩家，凑不出全场人数，由客户端另带；旧版游戏不发送，按单人局算 */
  @ApiProperty({ required: false, default: 1 })
  @IsInt()
  @Min(1)
  playerCount: number = 1;
}
