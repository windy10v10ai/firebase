jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  Timestamp: class Timestamp {},
}));

import { getFirestore } from 'firebase-admin/firestore';

import { ChallengeMetric } from '../types/daily-challenge.types';

import { DailyChallengeGlobalFreezeStore } from './daily-challenge-global-freeze.store';

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

const contributionDocument = (steamId: number, value: number) => ({
  id: `2026-08-04_${steamId}`,
  data: () => ({
    dayId: '2026-08-04',
    steamId,
    assignmentId: '2026-08-04-global-damage',
    metric: ChallengeMetric.HERO_DAMAGE,
    value,
    createdAt: new Date('2026-08-04T01:00:00.000Z'),
    updatedAt: new Date('2026-08-04T02:00:00.000Z'),
  }),
});

describe('DailyChallengeGlobalFreezeStore.streamContributionPages', () => {
  it('uses stable value-descending and steam-id-ascending pagination', async () => {
    const first = contributionDocument(30, 100);
    const second = contributionDocument(10, 90);
    const third = contributionDocument(20, 80);
    const query = {
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      startAfter: jest.fn(),
      get: jest
        .fn()
        .mockResolvedValueOnce({ docs: [first, second], empty: false })
        .mockResolvedValueOnce({ docs: [third], empty: false }),
    };
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.startAfter.mockReturnValue(query);
    mockedGetFirestore.mockReturnValue({
      collection: jest.fn().mockReturnValue(query),
    } as unknown as ReturnType<typeof getFirestore>);

    const pages = [];
    for await (const page of new DailyChallengeGlobalFreezeStore().streamContributionPages(
      '2026-08-04',
      2,
    )) {
      pages.push(page);
    }

    expect(query.where).toHaveBeenCalledWith('dayId', '==', '2026-08-04');
    expect(query.orderBy.mock.calls).toEqual([
      ['value', 'desc'],
      ['steamId', 'asc'],
      ['value', 'desc'],
      ['steamId', 'asc'],
    ]);
    expect(query.limit).toHaveBeenNthCalledWith(1, 2);
    expect(query.startAfter).toHaveBeenCalledWith(second);
    expect(pages.map((page) => page.map(({ steamId }) => steamId))).toEqual([[30, 10], [20]]);
  });
});
