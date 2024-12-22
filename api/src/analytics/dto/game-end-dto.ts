import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

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
  gold: number;
  @ApiProperty()
  kills: number;
  @ApiProperty()
  deaths: number;
  @ApiProperty()
  assists: number;
  // FIXME 用score替代 删除
  @ApiProperty()
  points: number;

  @ApiProperty()
  score: number;
  @ApiProperty()
  battlePoints: number;
}

export class GameEndDto extends EventBaseDto {
  @ApiProperty({ type: GameEndGameOptionsDto })
  gameOptions: GameEndGameOptionsDto;
  @ApiProperty({ default: 2 })
  winnerTeamId: number;
  @ApiProperty()
  gameTimeMsec: number;
  @ApiProperty({ type: [GameEndPlayerDto], maxLength: 20 })
  @IsNotEmpty()
  players: GameEndPlayerDto[];
}
