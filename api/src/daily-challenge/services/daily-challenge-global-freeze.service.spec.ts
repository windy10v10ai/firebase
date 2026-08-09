import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';
import { DailyChallengeGlobalContribution } from '../entities/daily-challenge-global-contribution.entity';
import {
  ChallengeDayStatus,
  ChallengeMetric,
  ChallengeScope,
  ChallengeUnit,
  DailyChallengeContributionTier,
} from '../types/daily-challenge.types';

import { DailyChallengeGlobalFreezeService } from './daily-challenge-global-freeze.service';
import { DailyChallengeGlobalFreezeStore } from './daily-challenge-global-freeze.store';
import { DailyChallengeGlobalRankingService } from './daily-challenge-global-ranking.service';

const now = new Date('2026-08-04T18:01:00.000Z');

const createDay = (overrides: Partial<DailyChallengeDay> = {}): DailyChallengeDay => ({
  id: '2026-08-04',
  schemaVersion: 2,
  dayId: '2026-08-04',
  configVersionId: 'config-v1',
  configVersion: 1,
  globalTask: {
    assignmentId: '2026-08-04-global-damage',
    taskId: 'global-damage',
    revision: 1,
    configVersion: 1,
    scope: ChallengeScope.GLOBAL,
    metric: ChallengeMetric.HERO_DAMAGE,
    unit: ChallengeUnit.DAMAGE,
    title: { cn: '共同伤害', en: 'Global damage', ru: 'Global damage' },
    description: { cn: '造成伤害', en: 'Deal damage', ru: 'Deal damage' },
    target: 100,
    progress: 0,
    rewardSeasonPoint: 0,
  },
  globalRewardTiers: {
    topPercent: 10,
    middlePercent: 30,
    topRewardSeasonPoint: 100,
    middleRewardSeasonPoint: 90,
    baseRewardSeasonPoint: 80,
  },
  startsAt: new Date('2026-08-03T16:00:00.000Z'),
  endsAt: new Date('2026-08-04T16:00:00.000Z'),
  closesAt: new Date('2026-08-04T18:00:00.000Z'),
  status: ChallengeDayStatus.CLOSING,
  createdAt: new Date('2026-08-03T16:00:00.000Z'),
  updatedAt: new Date('2026-08-04T16:00:00.000Z'),
  ...overrides,
});

const contribution = (steamId: number, value: number): DailyChallengeGlobalContribution => ({
  id: `2026-08-04_${steamId}`,
  dayId: '2026-08-04',
  steamId,
  assignmentId: '2026-08-04-global-damage',
  metric: ChallengeMetric.HERO_DAMAGE,
  value,
  createdAt: new Date('2026-08-04T01:00:00.000Z'),
  updatedAt: new Date('2026-08-04T02:00:00.000Z'),
});

const streamPages = (pages: DailyChallengeGlobalContribution[][]) =>
  (async function* () {
    for (const page of pages) {
      yield page;
    }
  })();

const createStore = () =>
  ({
    beginFreeze: jest.fn(),
    streamContributionPages: jest.fn(),
    writeRankings: jest.fn(),
    completeFreeze: jest.fn(),
  }) as unknown as jest.Mocked<DailyChallengeGlobalFreezeStore>;

const completeFreeze = (store: jest.Mocked<DailyChallengeGlobalFreezeStore>) => {
  store.completeFreeze.mockImplementation(async (_dayId, summary) =>
    createDay({
      freezeStartedAt: now,
      frozenAt: now,
      status: ChallengeDayStatus.FROZEN,
      ...summary,
    }),
  );
};

describe('DailyChallengeGlobalFreezeService', () => {
  it('uses one streaming pass and skips ranking when the global target was not reached', async () => {
    const store = createStore();
    store.beginFreeze.mockResolvedValue(createDay({ freezeStartedAt: now }));
    store.streamContributionPages.mockImplementation(() =>
      streamPages([[contribution(1, 40), contribution(2, 0)]]),
    );
    completeFreeze(store);

    const result = await new DailyChallengeGlobalFreezeService(
      store,
      new DailyChallengeGlobalRankingService(),
    ).freeze('2026-08-04', now);

    expect(store.streamContributionPages).toHaveBeenCalledTimes(1);
    expect(store.writeRankings).not.toHaveBeenCalled();
    expect(store.completeFreeze).toHaveBeenCalledWith('2026-08-04', {
      globalProgress: 40,
      globalCompleted: false,
      eligibleContributionCount: 1,
      frozenAt: now,
    });
    expect(result.globalCompleted).toBe(false);
  });

  it('uses a second ordered pass and promotes ties across page boundaries', async () => {
    const store = createStore();
    const day = createDay({ freezeStartedAt: now });
    day.globalTask.target = 1;
    day.globalRewardTiers = { ...day.globalRewardTiers, topPercent: 20 };
    store.beginFreeze.mockResolvedValue(day);
    const pages = [
      [contribution(1, 100), contribution(2, 90)],
      [contribution(3, 90), contribution(4, 80), contribution(5, 70)],
      [
        contribution(6, 70),
        contribution(7, 60),
        contribution(8, 50),
        contribution(9, 40),
        contribution(10, 30),
      ],
    ];
    store.streamContributionPages.mockImplementation(() => streamPages(pages));
    completeFreeze(store);

    await new DailyChallengeGlobalFreezeService(
      store,
      new DailyChallengeGlobalRankingService(),
    ).freeze('2026-08-04', now);

    const rankings = store.writeRankings.mock.calls.flatMap(([batch]) => batch);
    expect(store.streamContributionPages).toHaveBeenCalledTimes(2);
    expect(rankings.map(({ steamId }) => steamId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rankings.slice(0, 3).map(({ tier }) => tier)).toEqual([
      DailyChallengeContributionTier.TOP,
      DailyChallengeContributionTier.TOP,
      DailyChallengeContributionTier.TOP,
    ]);
    expect(rankings.slice(3, 6).map(({ tier }) => tier)).toEqual([
      DailyChallengeContributionTier.MIDDLE,
      DailyChallengeContributionTier.MIDDLE,
      DailyChallengeContributionTier.MIDDLE,
    ]);
    expect(
      rankings.slice(6).every(({ tier }) => tier === DailyChallengeContributionTier.BASE),
    ).toBe(true);
  });

  it('never keeps or writes more than 500 ranking rows at once', async () => {
    const store = createStore();
    const day = createDay({ freezeStartedAt: now });
    day.globalTask.target = 1;
    store.beginFreeze.mockResolvedValue(day);
    const contributions = Array.from({ length: 1001 }, (_, index) =>
      contribution(index + 1, 1001 - index),
    );
    store.streamContributionPages.mockImplementation(() => streamPages([contributions]));
    completeFreeze(store);

    await new DailyChallengeGlobalFreezeService(
      store,
      new DailyChallengeGlobalRankingService(),
    ).freeze('2026-08-04', now);

    expect(store.writeRankings.mock.calls.map(([batch]) => batch.length)).toEqual([500, 500, 1]);
  });

  it('returns an already frozen day without scanning contributions', async () => {
    const frozenDay = createDay({
      status: ChallengeDayStatus.FROZEN,
      freezeStartedAt: now,
      frozenAt: now,
      globalProgress: 100,
      globalCompleted: true,
      eligibleContributionCount: 2,
    });
    const store = createStore();
    store.beginFreeze.mockResolvedValue(frozenDay);

    const result = await new DailyChallengeGlobalFreezeService(
      store,
      new DailyChallengeGlobalRankingService(),
    ).freeze('2026-08-04', now);

    expect(result).toBe(frozenDay);
    expect(store.streamContributionPages).not.toHaveBeenCalled();
    expect(store.writeRankings).not.toHaveBeenCalled();
    expect(store.completeFreeze).not.toHaveBeenCalled();
  });

  it('retries after one ranking batch was committed without gaps, duplicates, or tier changes', async () => {
    const store = createStore();
    const freezingDay = createDay({ freezeStartedAt: now });
    freezingDay.globalTask.target = 1;
    store.beginFreeze.mockResolvedValue(freezingDay);
    const contributions = Array.from({ length: 501 }, (_, index) =>
      contribution(index + 1, 501 - index),
    );
    store.streamContributionPages.mockImplementation(() => streamPages([contributions]));
    const persisted = new Map<number, DailyChallengeContributionTier>();
    const firstCommittedBatch = new Map<number, DailyChallengeContributionTier>();
    let writeCall = 0;
    store.writeRankings.mockImplementation(async (rankings) => {
      writeCall += 1;
      if (writeCall === 2) {
        throw new Error('batch failed');
      }
      for (const ranking of rankings) {
        persisted.set(ranking.steamId, ranking.tier);
        if (writeCall === 1) {
          firstCommittedBatch.set(ranking.steamId, ranking.tier);
        }
      }
    });
    completeFreeze(store);
    const service = new DailyChallengeGlobalFreezeService(
      store,
      new DailyChallengeGlobalRankingService(),
    );

    await expect(service.freeze('2026-08-04', now)).rejects.toThrow('batch failed');
    expect(persisted.size).toBe(500);
    expect(store.completeFreeze).not.toHaveBeenCalled();

    await expect(service.freeze('2026-08-04', now)).resolves.toMatchObject({
      status: ChallengeDayStatus.FROZEN,
      globalCompleted: true,
    });
    expect(store.writeRankings.mock.calls.map(([batch]) => batch.length)).toEqual([500, 1, 500, 1]);
    expect(persisted.size).toBe(501);
    expect([...persisted.keys()].sort((left, right) => left - right)).toEqual(
      Array.from({ length: 501 }, (_, index) => index + 1),
    );
    for (const [steamId, tier] of firstCommittedBatch) {
      expect(persisted.get(steamId)).toBe(tier);
    }
    expect(store.completeFreeze).toHaveBeenCalledTimes(1);
  });
});
