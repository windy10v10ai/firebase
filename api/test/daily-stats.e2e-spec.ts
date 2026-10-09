import { INestApplication } from '@nestjs/common';

import { DailyStatsService } from '../src/daily-stats/daily-stats.service';
import { RadarBaseline } from '../src/player/entities/radar-baseline';

import { initTest } from './util/util-http';

function createBaseline(sampleCount: number): RadarBaseline {
  const quantiles = Array.from({ length: 21 }, (_, i) => i);
  return {
    difficulties: {
      '3': {
        sampleCount,
        damage: quantiles,
        gold: quantiles,
        participation: quantiles,
        push: quantiles,
        deaths: quantiles,
        tank: quantiles,
        healing: quantiles,
        assists: quantiles,
        stuns: quantiles,
      },
    },
  };
}

// 统计由定时任务写入，没有 HTTP 入口，直接调 service 验证落库行为
describe('DailyStatsService (e2e)', () => {
  let app: INestApplication;
  let dailyStatsService: DailyStatsService;

  beforeAll(async () => {
    app = await initTest();
    dailyStatsService = app.get(DailyStatsService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('同一种统计重复保存时后一次覆盖前一次', async () => {
    await dailyStatsService.save('radarBaseline', createBaseline(100));
    await dailyStatsService.save('radarBaseline', createBaseline(200));

    const saved = await dailyStatsService.get('radarBaseline');

    expect(saved).toEqual(createBaseline(200));
  });
});
