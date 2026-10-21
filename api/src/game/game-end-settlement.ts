import { GameEndDto } from '../analytics/dto/game-end-dto';

export interface GameEndSettlement {
  recorded: boolean;
  analyticsGameEnd: GameEndDto;
}

/** 基础奖励先占用额度，任务获得积分只记剩余实际发放的部分。 */
export function buildSettledGameEnd(gameEnd: GameEndDto, awards: Map<number, number>): GameEndDto {
  return {
    ...gameEnd,
    players: gameEnd.players.map((player) => {
      if (player.steamId <= 0) return player;
      const actual = awards.get(player.steamId) ?? 0;
      const requested = Number.isFinite(player.battlePoints) ? Math.max(0, player.battlePoints) : 0;
      const requestedDaily = Math.min(requested, Math.max(0, player.dailyTask?.seasonPoint ?? 0));
      const dailyPoints = Math.min(
        requestedDaily,
        Math.max(0, actual - (requested - requestedDaily)),
      );
      return {
        ...player,
        battlePoints: actual,
        ...(player.dailyTask
          ? { dailyTask: { ...player.dailyTask, seasonPoint: dailyPoints } }
          : {}),
      };
    }),
  };
}
