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

function createController(services: {
  gameService?: object;
  dailyTaskService?: object;
  feedbackService?: object;
  playerStatsRadarService?: object;
}) {
  return new ProxyController(
    (services.gameService ?? {}) as never,
    {} as never,
    {} as never,
    {} as never,
    (services.dailyTaskService ?? {}) as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    (services.feedbackService ?? {}) as never,
    (services.playerStatsRadarService ?? {}) as never,
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

describe('ProxyController.feedbackPost', () => {
  const origin = { ip: '1.2.3.4' } as never;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

  it('解出 body 后交给反馈服务，回空对象', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const controller = createController({ feedbackService: { create } });
    const body = { source: 'game', type: 'problem', topics: ['game'], steamId: 1 };

    const html = await controller.feedbackPost('req1', encode(body), origin);

    expect(create).toHaveBeenCalledWith(expect.objectContaining(body), origin);
    expect(html).toBe('<!DOCTYPE html><title>req1|{}</title>');
  });

  it('非法 body 抛错，不调用反馈服务', async () => {
    const create = jest.fn();
    const controller = createController({ feedbackService: { create } });

    await expect(
      controller.feedbackPost('req1', encode({ type: 'nope', topics: [] }), origin),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('ProxyController.playerStatsRadar', () => {
  it('原样回传六边形图数据', async () => {
    const result = { matchCount: 3, minMatchCount: 10, radar: null };
    const getRadar = jest.fn().mockResolvedValue(result);
    const controller = createController({ playerStatsRadarService: { getRadar } });

    const payload = parseTitle(await controller.playerStatsRadar('req1', 1));

    expect(getRadar).toHaveBeenCalledWith(1);
    expect(payload).toEqual(result);
  });
});
