jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  Timestamp: class Timestamp {},
}));

import { getFirestore } from 'firebase-admin/firestore';

import { PlayerDailyChallenge } from '../entities/player-daily-challenge.entity';

import {
  DailyChallengePlayerStore,
  normalizeDailyChallengePlayerStateData,
} from './daily-challenge-player.store';

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

const storedOperation = {
  id: 'stored-operation',
  type: 'accept',
  steamId: 483215844,
  dayId: '2026-08-04',
  requestId: 'duplicate-request',
  result: {
    code: 'accepted',
    snapshot: {},
    costMemberPoint: 0,
  },
  createdAt: new Date('2026-08-04T04:00:00.000Z'),
};

describe('DailyChallengePlayerStore.runOperation', () => {
  it('returns an existing operation before reading state or account documents', async () => {
    const reads: string[] = [];
    const operationRef = { path: 'daily_challenge_operation_ledger/operation-hash' };
    const stateRef = { path: 'player_daily_challenges/state-1' };
    const memberRef = { path: 'Members/483215844' };
    const playerRef = { path: 'Players/483215844' };
    const transaction = {
      get: jest.fn(async (ref: { path: string }) => {
        reads.push(ref.path);
        return ref === operationRef
          ? { id: 'operation-hash', exists: true, data: () => storedOperation }
          : { exists: false, data: () => undefined };
      }),
      set: jest.fn(),
      create: jest.fn(),
    };
    const db = {
      collection: jest.fn((name: string) => ({
        doc: jest.fn(() => {
          if (name === 'daily_challenge_operation_ledger') {
            return operationRef;
          }
          if (name === 'player_daily_challenges') {
            return stateRef;
          }
          if (name === 'Members') {
            return memberRef;
          }
          return playerRef;
        }),
      })),
      runTransaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    mockedGetFirestore.mockReturnValue(db as unknown as ReturnType<typeof getFirestore>);

    const store = new DailyChallengePlayerStore();
    const mutate = jest.fn(() => {
      throw new Error('mutate should not run for an existing operation');
    });

    const result = await store.runOperation('duplicate-request', 'state-1', 483215844, mutate);

    expect(result).toMatchObject({ ...storedOperation, id: expect.any(String) });
    expect(mutate).not.toHaveBeenCalled();
    expect(reads).toEqual([operationRef.path]);
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
  });
});

const createLegacyTask = (assignmentId = 'legacy-assignment') => ({
  assignmentId,
  taskId: 'legacy-damage',
  revision: 1,
  configVersion: 1,
  scope: 'personal_general',
  metric: 'hero_damage',
  unit: 'damage',
  title: { cn: '????', en: 'Deal damage', ru: 'Deal damage' },
  description: { cn: '????', en: 'Deal damage', ru: 'Deal damage' },
  target: 100,
  progress: 0,
  rewardSeasonPoint: 100,
});

const createLegacyState = (overrides: Record<string, unknown> = {}) => ({
  id: '2026-08-04_483215844',
  schemaVersion: 1,
  steamId: 483215844,
  dayId: '2026-08-04',
  configVersionId: 'v1',
  configVersion: 1,
  startsAt: new Date('2026-08-03T16:00:00.000Z'),
  endsAt: new Date('2026-08-04T16:00:00.000Z'),
  candidates: [createLegacyTask('legacy-candidate')],
  seenTaskIds: ['legacy-damage'],
  refreshCostsMemberPoint: [10, 20, 30, 40, 50],
  refreshIndex: 0,
  freeRefreshUsed: false,
  paidRefreshesUsed: 0,
  acceptedTask: createLegacyTask('legacy-accepted'),
  acceptedAt: new Date('2026-08-04T01:00:00.000Z'),
  progress: 50,
  unreadRewardCount: 0,
  streakDays: 0,
  streakMilestones: [],
  completedTasks: [createLegacyTask('legacy-completed')],
  createdAt: new Date('2026-08-04T00:00:00.000Z'),
  updatedAt: new Date('2026-08-04T00:00:00.000Z'),
  ...overrides,
});

describe('normalizeDailyChallengePlayerStateData', () => {
  it('upgrades an unfinished schema version 1 state with deterministic rounds and star defaults', () => {
    const state = normalizeDailyChallengePlayerStateData(
      createLegacyState() as Partial<PlayerDailyChallenge> & Record<string, unknown>,
      '2026-08-04_483215844',
    );

    expect(state.schemaVersion).toBe(2);
    expect(state.totalRounds).toBe(3);
    expect(state.completedRoundCount).toBe(1);
    expect(state.currentRound).toBe(2);
    expect(state.candidates).toEqual([
      expect.objectContaining({ star: 2, round: 2, totalRounds: 3 }),
    ]);
    expect(state.acceptedTask).toEqual(
      expect.objectContaining({ star: 2, round: 2, totalRounds: 3 }),
    );
    expect(state.completedTasks).toEqual([
      expect.objectContaining({ star: 2, round: 1, totalRounds: 3 }),
    ]);
  });
});

describe('DailyChallengePlayerStore.getOrCreateState legacy upgrade', () => {
  it('writes a completed schema version 1 state back as closed version 2 data', async () => {
    const stateRef = { path: 'player_daily_challenges/2026-08-04_483215844' };
    const legacyState = createLegacyState({
      completedAt: new Date('2026-08-04T02:00:00.000Z'),
    });
    const transaction = {
      get: jest.fn().mockResolvedValue({
        id: '2026-08-04_483215844',
        exists: true,
        data: () => legacyState,
      }),
      set: jest.fn(),
      create: jest.fn(),
    };
    const db = {
      collection: jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue(stateRef) }),
      runTransaction: jest.fn((callback: (value: typeof transaction) => unknown) =>
        Promise.resolve(callback(transaction)),
      ),
    };
    mockedGetFirestore.mockReturnValue(db as unknown as ReturnType<typeof getFirestore>);
    const factory = jest.fn();

    const result = await new DailyChallengePlayerStore().getOrCreateState(
      '2026-08-04_483215844',
      factory,
    );

    expect(factory).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      schemaVersion: 2,
      totalRounds: 3,
      currentRound: 3,
      completedRoundCount: 3,
      candidates: [],
      progress: 0,
    });
    expect(result.acceptedTask).toBeUndefined();
    expect(transaction.set).toHaveBeenCalledWith(
      stateRef,
      expect.objectContaining({
        schemaVersion: 2,
        totalRounds: 3,
        currentRound: 3,
        completedRoundCount: 3,
        candidates: [],
        progress: 0,
      }),
      { merge: true },
    );
    expect(transaction.create).not.toHaveBeenCalled();
  });
});
