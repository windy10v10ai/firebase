import { ApiProperty } from '@nestjs/swagger';

export class PlayerGameEnd {
  @ApiProperty()
  teamId: number;
  @ApiProperty()
  steamId: number;
  @ApiProperty()
  heroName: string;
  @ApiProperty()
  points: number;
  @ApiProperty()
  isDisconnect: boolean;
}

export class GameOption {
  @ApiProperty()
  gameDifficulty?: number;
  @ApiProperty()
  playerGoldXpMultiplier?: number;
  @ApiProperty()
  botGoldXpMultiplier?: number;
  @ApiProperty()
  towerPower: number;
  @ApiProperty()
  towerEndure: number;
}

export class GameEndDto {
  @ApiProperty({ type: [PlayerGameEnd] })
  players: PlayerGameEnd[];
  @ApiProperty()
  winnerTeamId: number;
  // FIXME: matchId is bigint, transform to string
  @ApiProperty()
  matchId: number;
  @ApiProperty()
  version: string;
  @ApiProperty()
  gameTimeMsec: number;
  @ApiProperty()
  gameOption?: GameOption;
}
