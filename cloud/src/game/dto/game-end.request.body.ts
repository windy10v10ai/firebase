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

export class GameEnd {
  @ApiProperty({ type: [PlayerGameEnd] })
  players: PlayerGameEnd[];
  @ApiProperty()
  winnerTeamId: number;
  @ApiProperty()
  matchId: string;
  @ApiProperty()
  gameOption?: GameOption;
}
