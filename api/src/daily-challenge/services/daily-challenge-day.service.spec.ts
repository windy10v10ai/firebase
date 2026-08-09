import { DailyChallengeConfigSnapshot } from '../types/daily-challenge-config.types';
import {
  ChallengeDayStatus,
  ChallengeMetric,
  ChallengeScope,
  ChallengeUnit,
} from '../types/daily-challenge.types';

import { DailyChallengeDayService } from './daily-challenge-day.service';
import { DailyChallengeDayStore } from './daily-challenge-day.store';
import { DailyChallengeGenerationService } from './daily-challenge-generation.service';

const now = new Date('2026-08-04T04:00:00.000Z');
const window = {
  dayId: '2026-08-04',
  startsAt: new Date('2026-08-03T16:00:00.000Z'),
  endsAt: new Date('2026-08-04T16:00:00.000Z'),
  closesAt: new Date('2026-08-04T18:00:00.000Z'),
};

const createConfig = (version: number, globalTaskId: string): DailyChallengeConfigSnapshot => ({
  id: 'daily-challenge',
  version,
  tasks: [
    {
      id: globalTaskId,
      revision: 1,
      enabled: true,
      scope: ChallengeScope.GLOBAL,
      metric: ChallengeMetric.BOT_KILLS,
      unit: ChallengeUnit.COUNT,
      category: 'bot_kills',
      title: { cn: globalTaskId, en: globalTaskId, ru: globalTaskId },
      description: { cn: globalTaskId, en: globalTaskId, ru: globalTaskId },
      target: 10000,
      rewardSeasonPoint: 100,
      weight: 1,
      expectedMatches: 1,
      cooldownDays: 0,
      minDataVersion: 1,
      groupTags: [],
      mutexTags: [],
    },
  ],
  globalTargetPolicies: {},
  globalRewardTiers: {
    topPercent: 10,
    middlePercent: 30,
    topRewardSeasonPoint: 100,
    middleRewardSeasonPoint: 90,
    baseRewardSeasonPoint: 80,
  },
  refreshCostsMemberPoint: [10, 20, 30, 50, 50],
  streakMilestones: [],
});

class MemoryDailyChallengeDayStore extends DailyChallengeDayStore {
  private readonly days = new Map<string, any>();

  async getOrCreate(dayId: string, factory: () => any): Promise<any> {
    if (!this.days.has(dayId)) {
      this.days.set(dayId, structuredClone(factory()));
    }
    return structuredClone(this.days.get(dayId));
  }
}

describe('DailyChallengeDayService', () => {
  it('locks one config version and one global task for every player on the challenge day', async () => {
    const configV7 = createConfig(7, 'global-bots-v7');
    const configV8 = createConfig(8, 'global-bots-v8');
    const configService = {
      getPublished: jest
        .fn()
        .mockResolvedValueOnce({ id: 'v7', version: 7, snapshot: configV7 })
        .mockResolvedValueOnce({ id: 'v8', version: 8, snapshot: configV8 }),
    };
    const service = new DailyChallengeDayService(
      new MemoryDailyChallengeDayStore(),
      configService as any,
      new DailyChallengeGenerationService(),
      { getWindow: jest.fn(() => window) } as any,
    );

    const first = await service.getOrCreate(now);
    const second = await service.getOrCreate(now);

    expect(first).toEqual(second);
    expect(first.status).toBe(ChallengeDayStatus.OPEN);
    expect(first.configVersionId).toBe('v7');
    expect(first.configVersion).toBe(7);
    expect(first.globalTask.taskId).toBe('global-bots-v7');
    expect(first.globalTask.revision).toBe(1);
    expect(first.globalRewardTiers).toEqual(configV7.globalRewardTiers);
    expect(configService.getPublished).toHaveBeenCalledTimes(2);
  });
});
