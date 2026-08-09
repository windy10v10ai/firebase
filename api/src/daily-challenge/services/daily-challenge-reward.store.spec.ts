jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  Timestamp: class Timestamp {},
}));

import { getFirestore } from 'firebase-admin/firestore';

import { DailyChallengeRewardSource } from '../types/daily-challenge.types';

import { DailyChallengeRewardStore } from './daily-challenge-reward.store';

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

const reward = {
  id: '2026-08-04_483215844_personal_assignment-1',
  dayId: '2026-08-04',
  steamId: 483215844,
  source: DailyChallengeRewardSource.PERSONAL,
  assignmentId: 'assignment-1',
  seasonPoint: 100,
  notificationStatus: 'pending' as const,
  createdAt: new Date('2026-08-05T02:00:00.000Z'),
};

const setupFirestore = (ledgerExists: boolean, playerExists = true) => {
  const rewardRef = { path: `daily_challenge_reward_ledger/${reward.id}` };
  const playerRef = { path: 'Players/483215844' };
  const reads: string[] = [];
  const transaction = {
    get: jest.fn(async (ref: { path: string }) => {
      reads.push(ref.path);
      if (ref === rewardRef) {
        return {
          id: reward.id,
          exists: ledgerExists,
          data: () => (ledgerExists ? reward : undefined),
        };
      }
      return {
        id: '483215844',
        exists: playerExists,
        data: () => (playerExists ? { id: '483215844', seasonPointTotal: 1000 } : undefined),
      };
    }),
    update: jest.fn(),
    create: jest.fn(),
  };
  const db = {
    collection: jest.fn((name: string) => ({
      doc: jest.fn(() => (name === 'daily_challenge_reward_ledger' ? rewardRef : playerRef)),
    })),
    runTransaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  mockedGetFirestore.mockReturnValue(db as any);
  return { reads, rewardRef, playerRef, transaction, db };
};

describe('DailyChallengeRewardStore.grant', () => {
  it('returns the existing reward before reading or updating the player', async () => {
    const { reads, rewardRef, transaction } = setupFirestore(true);

    const result = await new DailyChallengeRewardStore().grant(reward);

    expect(result).toEqual({ reward, created: false });
    expect(reads).toEqual([rewardRef.path]);
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it('uses the supplied transaction and completes both reads before writing', async () => {
    const { reads, rewardRef, playerRef, transaction, db } = setupFirestore(false);

    const result = await new DailyChallengeRewardStore().grantInTransaction(
      transaction as any,
      reward,
    );

    expect(db.runTransaction).not.toHaveBeenCalled();
    expect(reads).toEqual([rewardRef.path, playerRef.path]);
    expect(transaction.update).toHaveBeenCalledWith(playerRef, { seasonPointTotal: 1100 });
    expect(transaction.create).toHaveBeenCalledWith(rewardRef, reward);
    expect(transaction.get.mock.invocationCallOrder[1]).toBeLessThan(
      transaction.update.mock.invocationCallOrder[0],
    );
    expect(transaction.get.mock.invocationCallOrder[1]).toBeLessThan(
      transaction.create.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ reward, created: true });
  });

  it('does not update the player or create a reward when the player is missing', async () => {
    const { reads, rewardRef, playerRef, transaction } = setupFirestore(false, false);

    await expect(
      new DailyChallengeRewardStore().grantInTransaction(transaction as any, reward),
    ).rejects.toThrow('Player 483215844 does not exist');

    expect(reads).toEqual([rewardRef.path, playerRef.path]);
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
  });

  it('creates the ledger and increases season points in the same transaction', async () => {
    const { reads, rewardRef, playerRef, transaction } = setupFirestore(false);

    const result = await new DailyChallengeRewardStore().grant(reward);

    expect(reads).toEqual([rewardRef.path, playerRef.path]);
    expect(transaction.update).toHaveBeenCalledWith(playerRef, { seasonPointTotal: 1100 });
    expect(transaction.create).toHaveBeenCalledWith(rewardRef, reward);
    expect(result).toEqual({ reward, created: true });
  });
});

const notificationReward = (
  id: string,
  notificationStatus: 'pending' | 'notified' | 'viewed',
  viewedAt?: Date,
) => ({
  ...reward,
  id,
  notificationStatus,
  ...(viewedAt ? { viewedAt } : {}),
});

const rewardDocument = (value: ReturnType<typeof notificationReward>) => ({
  id: value.id,
  ref: { path: `daily_challenge_reward_ledger/${value.id}` },
  data: () => value,
});

describe('DailyChallengeRewardStore notifications', () => {
  it('claims only pending rewards and marks them notified in the transaction', async () => {
    const pending = rewardDocument(notificationReward('pending-reward', 'pending'));
    const notified = rewardDocument(notificationReward('notified-reward', 'notified'));
    const viewed = rewardDocument(
      notificationReward('viewed-reward', 'viewed', new Date('2026-08-04T03:00:00.000Z')),
    );
    const query = { kind: 'reward-query' };
    const transaction = {
      get: jest.fn().mockResolvedValue({ docs: [pending, notified, viewed] }),
      update: jest.fn(),
    };
    const db = {
      collection: jest.fn(() => ({
        where: jest.fn().mockReturnValue(query),
      })),
      runTransaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    mockedGetFirestore.mockReturnValue(db as any);
    const claimedAt = new Date('2026-08-04T04:00:00.000Z');

    const result = await new DailyChallengeRewardStore().claimPending([483215844], claimedAt);

    expect(transaction.get).toHaveBeenCalledWith(query);
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.update).toHaveBeenCalledWith(pending.ref, {
      notificationStatus: 'notified',
      notifiedAt: claimedAt,
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 'pending-reward',
        notificationStatus: 'notified',
        notifiedAt: claimedAt,
      }),
    ]);
  });

  it('claims more than 500 pending rewards across separate transactions', async () => {
    const pending = Array.from({ length: 501 }, (_, index) =>
      rewardDocument(notificationReward(`pending-reward-${index}`, 'pending')),
    );
    const query = { kind: 'reward-query' };
    const transaction = {
      get: jest
        .fn()
        .mockResolvedValueOnce({ docs: pending })
        .mockResolvedValueOnce({ docs: [pending[500]] }),
      update: jest.fn(),
    };
    const db = {
      collection: jest.fn(() => ({
        where: jest.fn().mockReturnValue(query),
      })),
      runTransaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    mockedGetFirestore.mockReturnValue(db as any);
    const claimedAt = new Date('2026-08-04T04:00:00.000Z');

    await expect(
      new DailyChallengeRewardStore().claimPending([483215844], claimedAt),
    ).resolves.toHaveLength(501);
    expect(db.runTransaction).toHaveBeenCalledTimes(2);
    expect(transaction.update).toHaveBeenCalledTimes(501);
  });
  it('counts pending and notified rewards as unread but excludes viewed rewards', async () => {
    const documents = [
      rewardDocument(notificationReward('pending-reward', 'pending')),
      rewardDocument(notificationReward('notified-reward', 'notified')),
      rewardDocument(
        notificationReward('viewed-reward', 'viewed', new Date('2026-08-04T03:00:00.000Z')),
      ),
    ];
    const get = jest.fn().mockResolvedValue({ docs: documents });
    const db = {
      collection: jest.fn(() => ({
        where: jest.fn(() => ({ get })),
      })),
    };
    mockedGetFirestore.mockReturnValue(db as any);

    await expect(new DailyChallengeRewardStore().countUnread(483215844)).resolves.toBe(2);
  });

  it('splits more than 500 unread rewards across Firestore batches', async () => {
    const documents = Array.from({ length: 501 }, (_, index) =>
      rewardDocument(notificationReward(`pending-reward-${index}`, 'pending')),
    );
    const batches = Array.from({ length: 2 }, () => ({
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    }));
    const db = {
      collection: jest.fn(() => ({
        where: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ docs: documents }),
        })),
      })),
      batch: jest.fn().mockReturnValueOnce(batches[0]).mockReturnValueOnce(batches[1]),
    };
    mockedGetFirestore.mockReturnValue(db as any);
    const viewedAt = new Date('2026-08-04T04:00:00.000Z');

    await expect(new DailyChallengeRewardStore().markViewed(483215844, viewedAt)).resolves.toBe(
      501,
    );
    expect(db.batch).toHaveBeenCalledTimes(2);
    expect(batches[0].update).toHaveBeenCalledTimes(500);
    expect(batches[1].update).toHaveBeenCalledTimes(1);
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    expect(batches[1].commit).toHaveBeenCalledTimes(1);
  });
  it('marks pending and notified rewards viewed in one batch and leaves viewed rewards untouched', async () => {
    const pending = rewardDocument(notificationReward('pending-reward', 'pending'));
    const notified = rewardDocument(notificationReward('notified-reward', 'notified'));
    const viewed = rewardDocument(
      notificationReward('viewed-reward', 'viewed', new Date('2026-08-04T03:00:00.000Z')),
    );
    const update = jest.fn();
    const commit = jest.fn().mockResolvedValue(undefined);
    const db = {
      collection: jest.fn(() => ({
        where: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ docs: [pending, notified, viewed] }),
        })),
      })),
      batch: jest.fn(() => ({ update, commit })),
    };
    mockedGetFirestore.mockReturnValue(db as any);
    const viewedAt = new Date('2026-08-04T04:00:00.000Z');

    await expect(new DailyChallengeRewardStore().markViewed(483215844, viewedAt)).resolves.toBe(2);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(pending.ref, {
      notificationStatus: 'viewed',
      viewedAt,
    });
    expect(update).toHaveBeenCalledWith(notified.ref, {
      notificationStatus: 'viewed',
      viewedAt,
    });
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

describe('DailyChallengeRewardStore history', () => {
  it('returns the newest rewards first and limits the history query', async () => {
    const older = rewardDocument({
      ...notificationReward('older-reward', 'viewed'),
      createdAt: new Date('2026-08-03T02:00:00.000Z'),
    });
    const newer = rewardDocument({
      ...notificationReward('newer-reward', 'notified'),
      createdAt: new Date('2026-08-04T02:00:00.000Z'),
    });
    const get = jest.fn().mockResolvedValue({ docs: [newer, older] });
    const limit = jest.fn(() => ({ get }));
    const orderBy = jest.fn(() => ({ limit }));
    const where = jest.fn(() => ({ orderBy }));
    const db = { collection: jest.fn(() => ({ where })) };
    mockedGetFirestore.mockReturnValue(db as any);

    await expect(new DailyChallengeRewardStore().listRecent(483215844, 20)).resolves.toEqual([
      expect.objectContaining({ id: 'newer-reward' }),
      expect.objectContaining({ id: 'older-reward' }),
    ]);
    expect(where).toHaveBeenCalledWith('steamId', '==', 483215844);
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(limit).toHaveBeenCalledWith(20);
  });
});
