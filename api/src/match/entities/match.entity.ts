import { Collection } from 'fireorm';

import { GameOption, PlayerGameEnd } from '../../game/dto/game-end.request.body';

@Collection()
export class Match {
  id: string;
  version: string;
  difficulty: number;
  winnerTeamId: number;
  gameOption: GameOption;
  players: PlayerGameEnd[];
}
