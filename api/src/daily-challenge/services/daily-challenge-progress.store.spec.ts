jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  Timestamp: class Timestamp {},
}));

import { getFirestore } from 'firebase-admin/firestore';

import { ChallengeMetric } from '../types/daily-challenge.types';

import { DailyChallengeProgressStore } from './daily-challenge-progress.store';

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

const createStore = (rewardStore = { grantInTransaction: jest.fn() }) =>
  new DailyChallengeProgressStore(rewardStore as any);

const storedLedger = {
  id: 'match-1_483215844',
  matchId: 'match-1',
  steamId: 483215844,
  dayId: '2026-08-04',
  normallySettled: true,
  acceptedAssignmentId: 'assignment-1',
  metric: ChallengeMetric.HERO_DAMAGE,
  reportedValue: 300000,
  appliedPersonalProgress: 300000,
  createdAt: new Date('2026-08-04T03:00:00.000Z'),
};

const createState = () => ({
  id: '2026-08-04_483215844',
  schemaVersion: 2,
  steamId: 483215844,
  dayId: '2026-08-04',
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
});

const setupFirestore = (options: { ledgerExists: boolean; stateExists?: boolean }) => {
  const reads: string[] = [];
  const ledgerRef = { path: 'daily_challenge_match_ledger/match-1_483215844' };
  const stateRef = { path: 'player_daily_challenges/2026-08-04_483215844' };
  const transaction = {
    get: jest.fn(async (ref: { path: string }) => {
      reads.push(ref.path);
      if (ref === ledgerRef) {
        return {
          id: storedLedger.id,
          exists: options.ledgerExists,
          data: () => (options.ledgerExists ? storedLedger : undefined),
        };
      }
      return {
        id: '2026-08-04_483215844',
        exists: options.stateExists !== false,
        data: () => (options.stateExists !== false ? createState() : undefined),
      };
    }),
    set: jest.fn(),
    create: jest.fn(),
  };
  const db = {
    collection: jest.fn((name: string) => ({
      doc: jest.fn(() => (name === 'daily_challenge_match_ledger' ? ledgerRef : stateRef)),
    })),
    runTransaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  mockedGetFirestore.mockReturnValue(db as any);
  return { reads, ledgerRef, stateRef, transaction };
};

describe('DailyChallengeProgressStore.runMatchContribution', () => {
  it('returns an existing ledger before reading or locking player state', async () => {
    const { reads, ledgerRef, transaction } = setupFirestore({ ledgerExists: true });
    const mutate = jest.fn(() => {
      throw new Error('mutate should not run for an existing ledger');
    });

    const result = await createStore().runMatchContribution(
      storedLedger.id,
      '2026-08-04_483215844',
      mutate,
    );

    expect(result).toEqual({ ledger: storedLedger, ledgerCreated: false });
    expect(reads).toEqual([ledgerRef.path]);
    expect(mutate).not.toHaveBeenCalled();
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it('normalizes legacy player state before passing it to a match mutator', async () => {
    const { transaction } = setupFirestore({ ledgerExists: false });
    const mutate = jest.fn(() => ({ ledger: storedLedger as any }));

    await createStore().runMatchContribution(
      'match-legacy_483215844',
      '2026-08-04_483215844',
      mutate,
    );

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 2,
        totalRounds: 3,
        currentRound: 1,
        completedRoundCount: 0,
        completedTasks: [],
      }),
      null,
    );
    expect(transaction.create).toHaveBeenCalled();
  });

  it('updates state and creates a sanitized ledger in the same transaction', async () => {
    const { reads, ledgerRef, stateRef, transaction } = setupFirestore({ ledgerExists: false });
    const updatedState = { ...createState(), progress: 300000, optionalValue: undefined };

    const result = await createStore().runMatchContribution(
      storedLedger.id,
      '2026-08-04_483215844',
      () => ({
        state: updatedState as any,
        ledger: { ...storedLedger, id: undefined, acceptedAssignmentId: undefined } as any,
      }),
    );

    expect(reads).toEqual([ledgerRef.path, stateRef.path]);
    expect(transaction.set).toHaveBeenCalledWith(
      stateRef,
      expect.not.objectContaining({ optionalValue: undefined }),
    );
    expect(transaction.create).toHaveBeenCalledWith(
      ledgerRef,
      expect.not.objectContaining({ id: expect.anything(), acceptedAssignmentId: undefined }),
    );
    expect(result).toMatchObject({
      ledger: { id: storedLedger.id, matchId: 'match-1' },
      ledgerCreated: true,
    });
  });

  it('persists a completed personal reward through the same transaction as progress and its match ledger', async () => {
    const { ledgerRef, stateRef, transaction } = setupFirestore({ ledgerExists: false });
    const reward = {
      id: '2026-08-04_483215844_personal_assignment-1',
      dayId: '2026-08-04',
      steamId: 483215844,
      source: 'personal',
      assignmentId: 'assignment-1',
      seasonPoint: 100,
      notificationStatus: 'notified',
      createdAt: new Date('2026-08-04T03:00:00.000Z'),
    };
    const rewardStore = {
      grantInTransaction: jest.fn().mockResolvedValue({ reward, created: true }),
    };
    const updatedState = { ...createState(), progress: 300000 };

    const result = await createStore(rewardStore).runMatchContribution(
      storedLedger.id,
      '2026-08-04_483215844',
      () => ({
        state: updatedState as any,
        personalReward: reward as any,
        ledger: { ...storedLedger, id: undefined } as any,
      }),
    );

    expect(rewardStore.grantInTransaction).toHaveBeenCalledWith(transaction, reward);
    expect(transaction.set).toHaveBeenCalledWith(stateRef, updatedState);
    expect(transaction.create).toHaveBeenCalledWith(
      ledgerRef,
      expect.objectContaining({
        personalRewardLedgerId: reward.id,
      }),
    );
    expect(result).toMatchObject({
      ledger: expect.objectContaining({ id: storedLedger.id }),
      ledgerCreated: true,
      personalRewardGrant: { created: true },
    });
  });

  it('does not write player state or match ledger when the atomic reward grant fails', async () => {
    const { stateRef, ledgerRef, transaction } = setupFirestore({ ledgerExists: false });
    const rewardStore = {
      grantInTransaction: jest.fn().mockRejectedValue(new Error('Player 483215844 does not exist')),
    };
    const mutate = jest.fn(() => ({
      state: { ...createState(), progress: 300000 } as any,
      personalReward: {
        id: '2026-08-04_483215844_personal_assignment-1',
        dayId: '2026-08-04',
        steamId: 483215844,
        source: 'personal',
        assignmentId: 'assignment-1',
        seasonPoint: 100,
        notificationStatus: 'notified',
        createdAt: new Date('2026-08-04T03:00:00.000Z'),
      } as any,
      ledger: { ...storedLedger, id: undefined } as any,
    }));

    await expect(
      createStore(rewardStore).runMatchContribution(
        storedLedger.id,
        '2026-08-04_483215844',
        mutate,
      ),
    ).rejects.toThrow('Player 483215844 does not exist');

    expect(transaction.set).not.toHaveBeenCalledWith(stateRef, expect.anything());
    expect(transaction.create).not.toHaveBeenCalledWith(ledgerRef, expect.anything());
  });

  it('still creates a zero-change ledger when player state does not exist', async () => {
    const { stateRef, ledgerRef, transaction } = setupFirestore({
      ledgerExists: false,
      stateExists: false,
    });
    const mutate = jest.fn(() => ({
      ledger: { ...storedLedger, id: undefined, appliedPersonalProgress: 0 } as any,
    }));

    await createStore().runMatchContribution(storedLedger.id, '2026-08-04_483215844', mutate);

    expect(mutate).toHaveBeenCalledWith(null, null);
    expect(transaction.set).not.toHaveBeenCalledWith(stateRef, expect.anything());
    expect(transaction.create).toHaveBeenCalledWith(
      ledgerRef,
      expect.objectContaining({ appliedPersonalProgress: 0 }),
    );
  });

  it('updates the per-player global contribution in the match transaction', async () => {
    const ledgerRef = { path: 'daily_challenge_match_ledger/match-global_483215844' };
    const dayRef = { path: 'daily_challenge_days/2026-08-04' };
    const stateRef = { path: 'player_daily_challenges/2026-08-04_483215844' };
    const globalRef = {
      path: 'daily_challenge_global_contributions/2026-08-04_483215844',
    };
    const reads: string[] = [];
    const transaction = {
      get: jest.fn(async (ref: { path: string }) => {
        reads.push(ref.path);
        if (ref === ledgerRef || ref === globalRef) {
          return { id: ref.path.split('/')[1], exists: false, data: () => undefined };
        }
        if (ref === dayRef) {
          return { id: '2026-08-04', exists: true, data: () => ({ status: 'closing' }) };
        }
        return {
          id: '2026-08-04_483215844',
          exists: true,
          data: () => createState(),
        };
      }),
      set: jest.fn(),
      create: jest.fn(),
    };
    const db = {
      collection: jest.fn((name: string) => ({
        doc: jest.fn(() => {
          if (name === 'daily_challenge_match_ledger') return ledgerRef;
          if (name === 'daily_challenge_global_contributions') return globalRef;
          if (name === 'daily_challenge_days') return dayRef;
          return stateRef;
        }),
      })),
      runTransaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    mockedGetFirestore.mockReturnValue(db as any);
    const globalContribution = {
      id: '2026-08-04_483215844',
      dayId: '2026-08-04',
      steamId: 483215844,
      assignmentId: 'global-assignment-1',
      metric: ChallengeMetric.HERO_DAMAGE,
      value: 120000,
      createdAt: new Date('2026-08-04T03:00:00.000Z'),
      updatedAt: new Date('2026-08-04T03:00:00.000Z'),
    };

    await createStore().runMatchContribution(
      'match-global_483215844',
      '2026-08-04_483215844',
      '2026-08-04_483215844',
      () => ({
        globalContribution,
        ledger: {
          ...storedLedger,
          matchId: 'match-global',
          reportedGlobalValue: 120000,
          appliedGlobalContribution: 120000,
        } as any,
      }),
    );

    expect(reads).toEqual([ledgerRef.path, dayRef.path, stateRef.path, globalRef.path]);
    expect(transaction.set).toHaveBeenCalledWith(globalRef, globalContribution);
    expect(transaction.create).toHaveBeenCalledWith(
      ledgerRef,
      expect.objectContaining({ appliedGlobalContribution: 120000 }),
    );
  });
  it('creates a zero-change ledger without writing progress after the day freeze has started', async () => {
    const ledgerRef = { path: 'daily_challenge_match_ledger/match-frozen_483215844' };
    const dayRef = { path: 'daily_challenge_days/2026-08-04' };
    const stateRef = { path: 'player_daily_challenges/2026-08-04_483215844' };
    const globalRef = {
      path: 'daily_challenge_global_contributions/2026-08-04_483215844',
    };
    const reads: string[] = [];
    const transaction = {
      get: jest.fn(async (ref: { path: string }) => {
        reads.push(ref.path);
        if (ref === ledgerRef) {
          return { id: 'match-frozen_483215844', exists: false, data: () => undefined };
        }
        if (ref === dayRef) {
          return {
            id: '2026-08-04',
            exists: true,
            data: () => ({
              freezeStartedAt: new Date('2026-08-04T18:00:00.000Z'),
              status: 'closing',
            }),
          };
        }
        throw new Error(`unexpected read ${ref.path}`);
      }),
      set: jest.fn(),
      create: jest.fn(),
    };
    const db = {
      collection: jest.fn((name: string) => ({
        doc: jest.fn(() => {
          if (name === 'daily_challenge_match_ledger') return ledgerRef;
          if (name === 'daily_challenge_days') return dayRef;
          if (name === 'daily_challenge_global_contributions') return globalRef;
          return stateRef;
        }),
      })),
      runTransaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    mockedGetFirestore.mockReturnValue(db as any);
    const mutate = jest.fn(() => ({
      ledger: {
        ...storedLedger,
        matchId: 'match-frozen',
        appliedPersonalProgress: 0,
        appliedGlobalContribution: 0,
      } as any,
    }));

    await createStore().runMatchContribution(
      'match-frozen_483215844',
      '2026-08-04_483215844',
      '2026-08-04_483215844',
      mutate,
    );

    expect(reads).toEqual([ledgerRef.path, dayRef.path]);
    expect(mutate).toHaveBeenCalledWith(null, null);
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.create).toHaveBeenCalledWith(
      ledgerRef,
      expect.objectContaining({
        appliedPersonalProgress: 0,
        appliedGlobalContribution: 0,
      }),
    );
  });
});
