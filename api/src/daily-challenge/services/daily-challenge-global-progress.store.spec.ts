jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  AggregateField: {
    sum: jest.fn((field: string) => ({ field })),
  },
}));

import { AggregateField, getFirestore } from 'firebase-admin/firestore';

import { ChallengeMetric } from '../types/daily-challenge.types';

import { DailyChallengeGlobalProgressStore } from './daily-challenge-global-progress.store';

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

describe('DailyChallengeGlobalProgressStore', () => {
  it('sums only contributions for the active shared-task assignment', async () => {
    const query = {
      where: jest.fn(),
      aggregate: jest.fn(),
    };
    query.where.mockReturnValue(query);
    query.aggregate.mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: () => ({ total: 123 }) }),
    });
    mockedGetFirestore.mockReturnValue({ collection: jest.fn().mockReturnValue(query) } as any);

    const result = await new DailyChallengeGlobalProgressStore().getCurrentProgress({
      dayId: '2026-08-08',
      assignmentId: '2026-08-08-global-roshan',
      metric: ChallengeMetric.ROSHAN_KILLS,
    });

    expect(query.where.mock.calls).toEqual([
      ['dayId', '==', '2026-08-08'],
      ['assignmentId', '==', '2026-08-08-global-roshan'],
      ['metric', '==', ChallengeMetric.ROSHAN_KILLS],
    ]);
    expect(AggregateField.sum).toHaveBeenCalledWith('value');
    expect(result).toBe(123);
  });
});
