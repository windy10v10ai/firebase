import { SERVER_TYPE } from '../util/secret/secret.service';

import { ProxyController } from './proxy.controller';

describe('ProxyController.gameStart', () => {
  it('每日任务不下发 history，其余字段保持不变', async () => {
    const gameService = {
      start: jest.fn().mockResolvedValue({
        players: [{ steamId: 1 }],
        pointInfo: [],
        dailyTasks: [
          {
            steamId: 1,
            dayId: '2026-09-21',
            candidates: [],
            completedTasks: [],
            todaySeasonPoint: 0,
            refreshRemaining: 2,
            history: [{ dayId: '2026-09-20', tasks: [], seasonPoint: 10 }],
          },
        ],
      }),
    };
    const controller = new ProxyController(
      gameService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const html = await controller.gameStart('req1', [1], 1, 'v1', SERVER_TYPE.LOCAL);

    const payload = JSON.parse(html.match(/<title>req1\|(.*)<\/title>/)![1]);
    expect(payload.dailyTasks[0]).not.toHaveProperty('history');
    expect(payload.dailyTasks[0]).toMatchObject({ dayId: '2026-09-21', refreshRemaining: 2 });
    expect(payload.players).toEqual([{ steamId: 1 }]);
  });

  it('没有每日任务时照常返回', async () => {
    const gameService = { start: jest.fn().mockResolvedValue({ players: [], pointInfo: [] }) };
    const controller = new ProxyController(
      gameService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const html = await controller.gameStart('req1', [1], 1, 'v1', SERVER_TYPE.LOCAL);

    expect(html).toBe('<!DOCTYPE html><title>req1|{"players":[],"pointInfo":[]}</title>');
  });
});
