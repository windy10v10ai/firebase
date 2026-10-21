import { GameEndDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';
import { ClientOrigin } from '../util/auth/client-origin.decorator';

import { GameEndRecordContext } from './game-end-rows';

export interface GameEndAuditDecision {
  player: GameEndPlayerDto;
  reasons: string[];
  accepted: boolean;
  awardedPoints: number;
}

/** 保留客户端原值和服务端判断，以便关联战绩与实际积分流水。 */
export function buildGameEndAuditRow(
  gameEnd: GameEndDto,
  context: GameEndRecordContext,
  decision: GameEndAuditDecision,
  origin: ClientOrigin,
  evaluatedAt: Date,
): Record<string, unknown> {
  const { players: _players, ...match } = gameEnd;
  return {
    evaluated_at: evaluatedAt.toISOString(),
    game_id: context.gameId,
    match_id: String(gameEnd.matchId),
    steam_id: decision.player.steamId,
    version: gameEnd.version,
    server_type: context.serverType,
    route: context.route,
    ip: origin.ip ?? null,
    country: origin.country ?? null,
    accepted: decision.accepted,
    reasons: decision.reasons,
    requested_points: Number.isFinite(decision.player.battlePoints)
      ? decision.player.battlePoints
      : null,
    awarded_points: decision.awardedPoints,
    raw: JSON.stringify({ ...match, player: decision.player }),
  };
}
