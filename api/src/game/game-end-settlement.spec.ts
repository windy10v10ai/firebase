import { GameEndDto } from '../analytics/dto/game-end-dto';

import { buildSettledGameEnd } from './game-end-settlement';

it('实际到账按基础优先分配给任务，原始报文不变', () => {
  const raw = {
    players: [
      { steamId: 1, battlePoints: 580, dailyTask: { seasonPoint: 100 } },
      { steamId: 2, battlePoints: 200, dailyTask: { seasonPoint: 80 } },
      { steamId: 3, battlePoints: 20000000 },
      { steamId: 0, battlePoints: 100 },
    ],
  } as GameEndDto;
  const result = buildSettledGameEnd(
    raw,
    new Map([
      [1, 500],
      [2, 0],
      [3, 500],
    ]),
  );
  expect(result.players.map((p) => [p.battlePoints, p.dailyTask?.seasonPoint])).toEqual([
    [500, 20],
    [0, 0],
    [500, undefined],
    [100, undefined],
  ]);
  expect(raw.players[0].battlePoints).toBe(580);
  expect(raw.players[0].dailyTask.seasonPoint).toBe(100);
});
