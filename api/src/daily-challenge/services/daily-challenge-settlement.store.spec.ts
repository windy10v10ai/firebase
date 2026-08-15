jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  Timestamp: class Timestamp {},
}));

import { getFirestore } from 'firebase-admin/firestore';

import { ChallengeDayStatus } from '../types/daily-challenge.types';

import { DailyChallengeSettlementStore } from './daily-challenge-settlement.store';

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

const dayDocument = (dayId: string, status: ChallengeDayStatus) => {
  const startsAt = new Date(`${dayId}T00:00:00.000Z`);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  return {
    id: dayId,
    data: () => ({
      id: dayId,
      dayId,
      status,
      startsAt,
      endsAt,
      closesAt: new Date(endsAt.getTime() + 60 * 60 * 1000),
      createdAt: startsAt,
      updatedAt: startsAt,
    }),
  };
};

describe('DailyChallengeSettlementStore.listEndedDays', () => {
  it('continues paging when an earlier page contains only settled days', async () => {
    const settled1 = dayDocument('2026-08-01', ChallengeDayStatus.SETTLED);
    const settled2 = dayDocument('2026-08-02', ChallengeDayStatus.SETTLED);
    const rewarding = dayDocument('2026-08-03', ChallengeDayStatus.REWARDING);
    const secondQuery = {
      startAfter: jest.fn(),
      get: jest.fn().mockResolvedValue({ docs: [rewarding] }),
    };
    const firstQuery = {
      startAfter: jest.fn().mockReturnValue(secondQuery),
      get: jest.fn().mockResolvedValue({ docs: [settled1, settled2] }),
    };
    const limit = jest.fn().mockReturnValue(firstQuery);
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ orderBy });
    mockedGetFirestore.mockReturnValue({
      collection: jest.fn().mockReturnValue({ where }),
    } as unknown as ReturnType<typeof getFirestore>);

    const result = await new DailyChallengeSettlementStore().listEndedDays(
      new Date('2026-08-04T00:00:00.000Z'),
      2,
    );

    expect(firstQuery.startAfter).toHaveBeenCalledWith(settled2);
    expect(secondQuery.get).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ dayId: '2026-08-03', status: ChallengeDayStatus.REWARDING });
  });
});

const rankingDocument = (steamId: number) => ({
  id: `2026-08-03_${steamId}`,
  data: () => ({
    dayId: '2026-08-03',
    steamId,
    assignmentId: '2026-08-03-global-damage',
    metric: 'hero_damage',
    value: 1000 - steamId,
    tier: 'base',
    rewardSeasonPoint: 80,
    frozenAt: new Date('2026-08-04T00:00:00.000Z'),
  }),
});

describe('DailyChallengeSettlementStore.streamGlobalRankingPages', () => {
  it('reads rankings in stable Steam ID pages using the last document cursor', async () => {
    const first = rankingDocument(1);
    const second = rankingDocument(2);
    const third = rankingDocument(3);
    const secondQuery = {
      get: jest.fn().mockResolvedValue({ docs: [third] }),
    };
    const firstQuery = {
      startAfter: jest.fn().mockReturnValue(secondQuery),
      get: jest.fn().mockResolvedValue({ docs: [first, second] }),
    };
    const limit = jest.fn().mockReturnValue(firstQuery);
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ orderBy });
    mockedGetFirestore.mockReturnValue({
      collection: jest.fn().mockReturnValue({ where }),
    } as unknown as ReturnType<typeof getFirestore>);

    const pages = [];
    for await (const page of new DailyChallengeSettlementStore().streamGlobalRankingPages(
      '2026-08-03',
      2,
    )) {
      pages.push(page);
    }

    expect(where).toHaveBeenCalledWith('dayId', '==', '2026-08-03');
    expect(orderBy).toHaveBeenCalledWith('steamId', 'asc');
    expect(limit).toHaveBeenCalledWith(2);
    expect(firstQuery.startAfter).toHaveBeenCalledWith(second);
    expect(pages.map((page) => page.map(({ steamId }) => steamId))).toEqual([[1, 2], [3]]);
  });

  it('caps ranking pages at the Firestore-safe batch size', async () => {
    const query = { get: jest.fn().mockResolvedValue({ docs: [] }) };
    const limit = jest.fn().mockReturnValue(query);
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ orderBy });
    mockedGetFirestore.mockReturnValue({
      collection: jest.fn().mockReturnValue({ where }),
    } as unknown as ReturnType<typeof getFirestore>);

    for await (const _page of new DailyChallengeSettlementStore().streamGlobalRankingPages(
      '2026-08-03',
      1000,
    )) {
      // No pages are expected from the empty snapshot.
    }

    expect(limit).toHaveBeenCalledWith(500);
  });
});

describe('DailyChallengeSettlementStore.listPlayerStates legacy compatibility', () => {
  it('normalizes a schema version 1 state before it reaches streak settlement', async () => {
    const legacyState = {
      schemaVersion: 1,
      steamId: 483215844,
      dayId: '2026-08-04',
      configVersionId: 'v1',
      configVersion: 1,
      startsAt: new Date('2026-08-03T16:00:00.000Z'),
      endsAt: new Date('2026-08-04T16:00:00.000Z'),
      candidates: [],
      seenTaskIds: [],
      refreshCostsMemberPoint: [],
      refreshIndex: 0,
      freeRefreshUsed: false,
      paidRefreshesUsed: 0,
      progress: 0,
      unreadRewardCount: 0,
      streakDays: 0,
      streakMilestones: [],
      createdAt: new Date('2026-08-04T00:00:00.000Z'),
      updatedAt: new Date('2026-08-04T00:00:00.000Z'),
    };
    const get = jest.fn().mockResolvedValue({
      docs: [
        {
          id: '2026-08-04_483215844',
          data: () => legacyState,
        },
      ],
    });
    const where = jest.fn().mockReturnValue({ get });
    mockedGetFirestore.mockReturnValue({
      collection: jest.fn().mockReturnValue({ where }),
    } as unknown as ReturnType<typeof getFirestore>);

    const states = await new DailyChallengeSettlementStore().listPlayerStates('2026-08-04');

    expect(where).toHaveBeenCalledWith('dayId', '==', '2026-08-04');
    expect(states).toEqual([
      expect.objectContaining({
        schemaVersion: 2,
        totalRounds: 3,
        currentRound: 1,
        completedRoundCount: 0,
        completedTasks: [],
      }),
    ]);
  });
});
