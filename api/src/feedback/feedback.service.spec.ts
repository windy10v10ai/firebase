import { gzipSync } from 'zlib';

import { BadRequestException, HttpException } from '@nestjs/common';

import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackRateLimit } from './entities/feedback-rate-limit.entity';
import { FeedbackReport } from './entities/feedback-report.entity';
import { FeedbackService, REPORTS_PER_HOUR, SITE_REPORTS_PER_DAY } from './feedback.service';

function memoryRepository<T extends { id: string }>() {
  const docs = new Map<string, T>();
  return {
    docs,
    findById: jest.fn(async (id: string) => docs.get(id) ?? null),
    create: jest.fn(async (item: T) => {
      docs.set(item.id, { ...item });
      return item;
    }),
    update: jest.fn(async (item: T) => {
      docs.set(item.id, { ...item });
      return item;
    }),
  };
}

const PROBLEM: CreateFeedbackDto = {
  type: 'problem',
  topics: ['bot'],
  description: '电脑一直站在泉水不动',
  steamId: 1001,
  launcherVersion: '0.4.2',
};

describe('FeedbackService', () => {
  let reports: ReturnType<typeof memoryRepository<FeedbackReport>>;
  let limits: ReturnType<typeof memoryRepository<FeedbackRateLimit>>;
  let storage: { save: jest.Mock };
  let service: FeedbackService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-04T12:00:00Z') });
    reports = memoryRepository<FeedbackReport>();
    limits = memoryRepository<FeedbackRateLimit>();
    storage = { save: jest.fn(async (path: string) => `gs://bucket/${path}`) };
    service = new FeedbackService(reports as never, limits as never, storage as never);
  });

  afterEach(() => jest.useRealTimers());

  it('存下报告与日志，并给提交者和全站各记一次', async () => {
    const log = gzipSync('10/04 12:00:00 Source2Shutdown');
    await service.create(
      {
        ...PROBLEM,
        launcherError: { message: '服务器意外退出', stage: 'start-server' },
        serverLog: log.toString('base64'),
      },
      { ip: '1.2.3.4', country: 'CN' },
    );

    const [report] = [...reports.docs.values()];
    expect(report).toMatchObject({
      source: 'launcher',
      type: 'problem',
      topics: ['bot'],
      tags: [],
      steamId: 1001,
      steamIdVerified: false,
      launcherError: { message: '服务器意外退出', stage: 'start-server' },
      serverLog: `gs://bucket/2026-10-04/${report.id}/server.log.gz`,
      country: 'CN',
    });
    expect(report.clientLog).toBeUndefined();
    expect(storage.save).toHaveBeenCalledWith(`2026-10-04/${report.id}/server.log.gz`, log);
    expect(limits.docs.get('all')).toMatchObject({ dailyDate: '2026-10-04', dailyCount: 1 });
    expect(limits.docs.get('steam-1001')).toMatchObject({ dailyDate: '2026-10-04', dailyCount: 1 });
  });

  it('游戏来源不需要启动器版本，游戏状态一并存下', async () => {
    const { launcherVersion: _, ...fromGame } = PROBLEM;
    const gameState = {
      gameTimeMsec: 1260000,
      playerCount: 3,
      gameOptions: { multiplierRadiant: 2, multiplierDire: 3, towerPowerPct: 100 },
      localHost: true,
      offline: false,
      heroName: 'npc_dota_hero_axe',
      level: 30,
      items: ['item_blink', '', '', '', '', ''],
      abilities: ['axe_berserkers_call', 'axe_counter_helix'],
    };
    await service.create(
      {
        ...fromGame,
        source: 'game',
        mapVersion: '4.5.0',
        gameState,
      },
      {},
    );

    const [report] = [...reports.docs.values()];
    expect(report).toMatchObject({
      source: 'game',
      steamIdVerified: false,
      mapVersion: '4.5.0',
      gameState,
    });
    expect(report.launcherVersion).toBeUndefined();
  });

  it('提建议必须写描述，日志必须是 gzip', async () => {
    await expect(
      service.create({ ...PROBLEM, type: 'suggestion', description: '  ' }, {}),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create({ ...PROBLEM, clientLog: Buffer.from('plain').toString('base64') }, {}),
    ).rejects.toThrow(BadRequestException);
    expect(reports.docs.size).toBe(0);
  });

  it('同一人一小时内超过上限被拒，过了一小时恢复；没有 Steam ID 时按 IP 计', async () => {
    const anonymous = { ...PROBLEM, steamId: undefined };
    for (let i = 0; i < REPORTS_PER_HOUR; i++) {
      await service.create(anonymous, { ip: '1.2.3.4' });
    }
    await expect(service.create(anonymous, { ip: '1.2.3.4' })).rejects.toThrow(HttpException);
    await service.create(anonymous, { ip: '5.6.7.8' });

    jest.advanceTimersByTime(60 * 60 * 1000 + 1);
    await service.create(anonymous, { ip: '1.2.3.4' });
    expect(limits.docs.get('ip-1.2.3.4')?.dailyCount).toBe(REPORTS_PER_HOUR + 1);
  });

  it('全站当天达到上限后谁都发不了，第二天归零', async () => {
    limits.docs.set('all', {
      id: 'all',
      dailyDate: '2026-10-04',
      dailyCount: SITE_REPORTS_PER_DAY,
      recent: [],
      expireAt: new Date(),
    });
    await expect(service.create(PROBLEM, {})).rejects.toMatchObject({
      message: 'daily_limit_reached',
    });

    jest.setSystemTime(new Date('2026-10-05T00:00:01Z'));
    await service.create(PROBLEM, {});
    expect(limits.docs.get('all')).toMatchObject({ dailyDate: '2026-10-05', dailyCount: 1 });
  });
});
