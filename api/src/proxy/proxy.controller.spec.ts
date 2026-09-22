import { SERVER_TYPE } from '../util/secret/secret.service';

import { ProxyController } from './proxy.controller';

const HISTORY = Array.from({ length: 30 }, (_, index) => ({
  dayId: `202609${String(30 - index).padStart(2, '0')}`,
  tasks: [],
  seasonPoint: 10,
}));

function parseTitle(html: string) {
  return JSON.parse(html.match(/<title>req1\|(.*)<\/title>/)![1]);
}

function createController(services: { gameService?: object; dailyTaskService?: object }) {
  return new ProxyController(
    (services.gameService ?? {}) as never,
    {} as never,
    {} as never,
    {} as never,
    (services.dailyTaskService ?? {}) as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('ProxyController.gameStart', () => {
  it('原样回传开局结果', async () => {
    const gameService = { start: jest.fn().mockResolvedValue({ players: [], pointInfo: [] }) };
    const controller = createController({ gameService });

    const html = await controller.gameStart('req1', [1], 1, 'v1', SERVER_TYPE.LOCAL);

    expect(html).toBe('<!DOCTYPE html><title>req1|{"players":[],"pointInfo":[]}</title>');
  });
});

describe('ProxyController 每日任务', () => {
  it('daily-task 只回最近 5 天历史，不含今日字段', async () => {
    const getSnapshotWithHistory = jest.fn().mockResolvedValue({
      steamId: 1,
      dayId: '20261001',
      candidates: [{ taskId: 'a' }],
      completedTasks: [],
      todaySeasonPoint: 0,
      refreshRemaining: 1,
      history: HISTORY,
    });
    const controller = createController({ dailyTaskService: { getSnapshotWithHistory } });

    const payload = parseTitle(await controller.dailyTask('req1', 1));

    expect(getSnapshotWithHistory).toHaveBeenCalledWith(1);
    expect(payload).toEqual({ steamId: 1, history: HISTORY.slice(0, 5) });
  });

  it('daily-task-refresh-post 解出 body 后刷新，非法 body 抛错', async () => {
    const refresh = jest.fn().mockResolvedValue({ steamId: 1, dayId: '20261001' });
    const controller = createController({ dailyTaskService: { refresh } });
    const body = Buffer.from(JSON.stringify({ steamId: 1, dayId: '20261001' })).toString(
      'base64url',
    );

    const payload = parseTitle(await controller.dailyTaskRefreshPost('req1', body));

    expect(refresh).toHaveBeenCalledWith(1, '20261001');
    expect(payload).toEqual({ steamId: 1, dayId: '20261001' });
    await expect(controller.dailyTaskRefreshPost('req1', 'not-json')).rejects.toThrow();
  });
});
