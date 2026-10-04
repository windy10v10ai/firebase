import { gzipSync } from 'zlib';

import { BadRequestException, HttpException } from '@nestjs/common';

import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackQuota } from './entities/feedback-quota.entity';
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
  let quotas: ReturnType<typeof memoryRepository<FeedbackQuota>>;
  let storage: { save: jest.Mock };
  let service: FeedbackService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-04T12:00:00Z') });
    reports = memoryRepository<FeedbackReport>();
    quotas = memoryRepository<FeedbackQuota>();
    storage = { save: jest.fn(async (path: string) => `gs://bucket/${path}`) };
    service = new FeedbackService(reports as never, quotas as never, storage as never);
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
    expect(quotas.docs.get('2026-10-04_all')?.count).toBe(1);
    expect(quotas.docs.get('2026-10-04_steam-1001')?.count).toBe(1);
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
    expect(quotas.docs.get('2026-10-04_ip-1.2.3.4')?.count).toBe(REPORTS_PER_HOUR + 1);
  });

  it('全站当天达到上限后谁都发不了', async () => {
    quotas.docs.set('2026-10-04_all', {
      id: '2026-10-04_all',
      count: SITE_REPORTS_PER_DAY,
      recent: [],
      expireAt: new Date(),
    });
    await expect(service.create(PROBLEM, {})).rejects.toMatchObject({
      message: 'daily_limit_reached',
    });
  });
});
