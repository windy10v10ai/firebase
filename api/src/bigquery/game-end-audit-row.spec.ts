import { GameEndDto } from '../analytics/dto/game-end-dto';
import { SERVER_TYPE } from '../util/secret/secret.service';

import { buildGameEndAuditRow } from './game-end-audit-row';

it('审计保留原始积分、实际到账和逐玩家上下文', () => {
  const player = { steamId: 123, battlePoints: 20000000 };
  const gameEnd = { matchId: '0', version: 'test', players: [player] } as GameEndDto;
  const row = buildGameEndAuditRow(
    gameEnd,
    { gameId: 'audit-test', serverType: SERVER_TYPE.LOCAL, route: 'local' },
    {
      player: gameEnd.players[0],
      reasons: ['points_out_of_range'],
      accepted: true,
      awardedPoints: 500,
    },
    { ip: '203.0.113.1', country: 'JP' },
    new Date('2026-10-21T00:00:00Z'),
  );
  expect(row).toMatchObject({
    game_id: 'audit-test',
    requested_points: 20000000,
    awarded_points: 500,
    ip: '203.0.113.1',
  });
  expect(JSON.parse(row.raw as string)).toEqual({ matchId: '0', version: 'test', player });
});
