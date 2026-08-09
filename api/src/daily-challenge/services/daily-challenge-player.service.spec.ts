import { DAILY_CHALLENGE_CONFIG as config } from '../config/tasks';
import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';
import {
  DailyChallengeAccountState,
  PlayerDailyChallenge,
} from '../entities/player-daily-challenge.entity';
import { ChallengeScope } from '../types/daily-challenge.types';

import { DailyChallengeDayService } from './daily-challenge-day.service';
import { DailyChallengeDayStore } from './daily-challenge-day.store';
import { DailyChallengeGenerationService } from './daily-challenge-generation.service';
import { DailyChallengePlayerService } from './daily-challenge-player.service';
import {
  DailyChallengeOperationContext,
  DailyChallengeOperationMutation,
  DailyChallengePlayerStore,
  DailyChallengeStoredOperation,
} from './daily-challenge-player.store';
import { DailyChallengeRefreshService } from './daily-challenge-refresh.service';

const now = new Date('2026-08-04T04:00:00.000Z');
const window = {
  dayId: '2026-08-04',
  startsAt: new Date('2026-08-03T16:00:00.000Z'),
  endsAt: new Date('2026-08-04T16:00:00.000Z'),
  closesAt: new Date('2026-08-04T18:00:00.000Z'),
};

class MemoryDailyChallengeDayStore extends DailyChallengeDayStore {
  days = new Map<string, DailyChallengeDay>();

  async getOrCreate(dayId: string, factory: () => DailyChallengeDay): Promise<DailyChallengeDay> {
    if (!this.days.has(dayId)) {
      this.days.set(dayId, structuredClone(factory()));
    }
    return structuredClone(this.days.get(dayId));
  }
}

class MemoryDailyChallengePlayerStore extends DailyChallengePlayerStore {
  states = new Map<string, PlayerDailyChallenge>();
  operations = new Map<string, DailyChallengeStoredOperation>();
  accounts = new Map<number, DailyChallengeAccountState>();
  private queue: Promise<void> = Promise.resolve();

  async getOrCreateState(
    id: string,
    factory: () => PlayerDailyChallenge,
  ): Promise<PlayerDailyChallenge> {
    if (!this.states.has(id)) {
      this.states.set(id, factory());
    }
    return structuredClone(this.states.get(id));
  }

  async getState(id: string): Promise<PlayerDailyChallenge | null> {
    const value = this.states.get(id);
    return value ? structuredClone(value) : null;
  }

  async getAccountState(steamId: number): Promise<DailyChallengeAccountState> {
    return structuredClone(
      this.accounts.get(steamId) ?? {
        member: null,
        player: {
          id: steamId.toString(),
          memberPointTotal: 0,
          usedMemberPoint: 0,
        },
      },
    );
  }

  async runOperation(
    operationId: string,
    stateId: string,
    steamId: number,
    mutate: (context: DailyChallengeOperationContext) => DailyChallengeOperationMutation,
  ): Promise<DailyChallengeStoredOperation> {
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => (release = resolve));
    await previous;
    try {
      const existing = this.operations.get(operationId);
      if (existing) {
        return structuredClone(existing);
      }
      const account = await this.getAccountState(steamId);
      const mutation = mutate({
        state: structuredClone(this.states.get(stateId) ?? null),
        member: account.member,
        player: account.player,
      });
      this.states.set(stateId, structuredClone(mutation.state));
      if (mutation.player) {
        this.accounts.set(steamId, {
          member: account.member,
          player: structuredClone(mutation.player),
        });
      }
      const operation = {
        id: operationId,
        ...mutation.operation,
      };
      this.operations.set(operationId, structuredClone(operation));
      return operation;
    } finally {
      release();
    }
  }
}

const createServices = (store = new MemoryDailyChallengePlayerStore()) => {
  const clock = { getWindow: jest.fn(() => window) };
  const generation = new DailyChallengeGenerationService();
  const rewardNotificationService = {
    getUnreadCount: jest.fn().mockResolvedValue(0),
    getRecentRewards: jest.fn().mockResolvedValue([]),
    markViewed: jest.fn().mockResolvedValue(0),
  };
  const globalProgressStore = {
    getCurrentProgress: jest.fn().mockResolvedValue(0),
  };
  const dayService = new DailyChallengeDayService(
    ...([new MemoryDailyChallengeDayStore(), generation, clock] as unknown as ConstructorParameters<
      typeof DailyChallengeDayService
    >),
  );
  const playerService = new DailyChallengePlayerService(
    ...([
      store,
      dayService,
      generation,
      clock,
      rewardNotificationService,
      globalProgressStore,
    ] as unknown as ConstructorParameters<typeof DailyChallengePlayerService>),
  );
  const refreshService = new DailyChallengeRefreshService(
    ...([store, generation, clock, playerService] as unknown as ConstructorParameters<
      typeof DailyChallengeRefreshService
    >),
  );
  return {
    store,
    playerService,
    refreshService,
    rewardNotificationService,
    globalProgressStore,
  };
};

describe('daily challenge player state and actions', () => {
  it('returns healthy player snapshots when another player snapshot fails', async () => {
    const { playerService } = createServices();
    jest.spyOn(playerService, 'getSnapshot').mockImplementation(async (steamId) => {
      if (steamId === 483215845) {
        throw new Error('corrupt daily challenge state');
      }
      return { steamId } as Awaited<ReturnType<DailyChallengePlayerService['getSnapshot']>>;
    });

    await expect(playerService.getSnapshots([483215844, 483215845], now)).resolves.toEqual([
      { steamId: 483215844 },
    ]);
  });

  it('overlays the live shared-task contribution total on player snapshots', async () => {
    const { playerService, globalProgressStore } = createServices();
    globalProgressStore.getCurrentProgress.mockResolvedValue(42);

    const snapshot = await playerService.getSnapshot(483215844, now);

    expect(snapshot.globalTask?.progress).toBe(42);
    expect(globalProgressStore.getCurrentProgress).toHaveBeenCalledWith({
      dayId: '2026-08-04',
      assignmentId: snapshot.globalTask?.assignmentId,
      metric: snapshot.globalTask?.metric,
    });
  });

  it('reuses one live shared-task aggregation for a multi-player snapshot batch', async () => {
    const { playerService, globalProgressStore } = createServices();
    globalProgressStore.getCurrentProgress.mockResolvedValue(17);

    const snapshots = await playerService.getSnapshots([483215844, 483215845], now);

    expect(snapshots).toHaveLength(2);
    expect(snapshots.every((snapshot) => snapshot.globalTask?.progress === 17)).toBe(true);
    expect(globalProgressStore.getCurrentProgress).toHaveBeenCalledTimes(1);
  });

  it('uses the reward ledger as the source of truth for unread rewards and recent history', async () => {
    const { playerService, rewardNotificationService } = createServices();
    const recentRewards = [
      {
        rewardId: 'reward-1',
        dayId: '2026-08-03',
        source: 'personal',
        seasonPoint: 100,
        createdAt: '2026-08-04T02:00:00.000Z',
      },
    ];
    rewardNotificationService.getUnreadCount.mockResolvedValue(3);
    rewardNotificationService.getRecentRewards.mockResolvedValue(recentRewards);

    const snapshot = await playerService.getSnapshot(483215844, now);

    expect(snapshot.unreadRewardCount).toBe(3);
    expect(snapshot.recentRewards).toEqual(recentRewards);
    expect(rewardNotificationService.getUnreadCount).toHaveBeenCalledWith(483215844);
    expect(rewardNotificationService.getRecentRewards).toHaveBeenCalledWith(483215844);
  });

  it('creates a stable current-day snapshot with two general choices and one hero choice', async () => {
    const { playerService } = createServices();

    const first = await playerService.getSnapshot(483215844, now);
    const second = await playerService.getSnapshot(483215844, now);

    expect(second).toEqual(first);
    expect(first.candidates).toHaveLength(3);
    expect(first.candidates.slice(0, 2).map((candidate) => candidate.scope)).toEqual([
      ChallengeScope.PERSONAL_GENERAL,
      ChallengeScope.PERSONAL_GENERAL,
    ]);
    expect(first.candidates[2]).toMatchObject({
      scope: ChallengeScope.PERSONAL_HERO,
      heroName: expect.stringMatching(/^npc_dota_hero_/),
    });
    expect(new Set(first.candidates.map((candidate) => candidate.assignmentId)).size).toBe(3);
    expect(first.needsSelection).toBe(true);
    expect(first.globalRewardTiers).toEqual(config.globalRewardTiers);
    expect(first.refresh.freeRefreshAvailable).toBe(false);
    expect(first.streak).toEqual({
      currentDays: 0,
      cycleTargetDays: 30,
      nextMilestoneDays: 3,
      nextMilestoneRewardSeasonPoint: 50,
    });
  });

  it('clears unread rewards through an idempotent viewed action', async () => {
    const { store, playerService, rewardNotificationService } = createServices();
    await playerService.getSnapshot(483215844, now);
    const state = [...store.states.values()][0];
    state.unreadRewardCount = 2;
    store.states.set(state.id, state);

    const viewed = await playerService.markViewed(
      483215844,
      { schemaVersion: 2, dayId: window.dayId, requestId: 'view-1' },
      now,
    );
    const duplicate = await playerService.markViewed(
      483215844,
      { schemaVersion: 2, dayId: window.dayId, requestId: 'view-1' },
      now,
    );

    expect(duplicate).toEqual(viewed);
    expect(viewed.code).toBe('viewed');
    expect(viewed.snapshot.unreadRewardCount).toBe(0);
    expect(store.states.get(state.id)?.unreadRewardCount).toBe(0);
    expect(rewardNotificationService.markViewed).toHaveBeenCalledTimes(2);
    expect(rewardNotificationService.markViewed).toHaveBeenLastCalledWith(483215844, now);
  });

  it('locks the selected task and returns the same result for a duplicate request id', async () => {
    const { playerService, rewardNotificationService } = createServices();
    rewardNotificationService.getRecentRewards.mockResolvedValue([{ rewardId: 'reward-1' }]);
    const snapshot = await playerService.getSnapshot(483215844, now);
    const assignmentId = snapshot.candidates[0].assignmentId;

    const accepted = await playerService.accept(
      483215844,
      {
        schemaVersion: 2,
        dayId: window.dayId,
        assignmentId,
        requestId: 'accept-1',
      },
      now,
    );
    const duplicate = await playerService.accept(
      483215844,
      {
        schemaVersion: 2,
        dayId: window.dayId,
        assignmentId,
        requestId: 'accept-1',
      },
      now,
    );

    expect(duplicate).toEqual(accepted);
    expect(accepted.code).toBe('accepted');
    expect(accepted.snapshot.acceptedTask?.assignmentId).toBe(assignmentId);
    expect(accepted.snapshot.needsSelection).toBe(false);
    expect(accepted.snapshot.recentRewards).toEqual([{ rewardId: 'reward-1' }]);

    await expect(
      playerService.accept(
        483215844,
        {
          schemaVersion: 2,
          dayId: window.dayId,
          assignmentId: snapshot.candidates[1].assignmentId,
          requestId: 'accept-2',
        },
        now,
      ),
    ).rejects.toMatchObject({ response: { code: 'already_selected' } });
  });

  it('rejects refresh for non-members', async () => {
    const { playerService, refreshService } = createServices();
    await playerService.getSnapshot(483215844, now);

    await expect(
      refreshService.refresh(
        483215844,
        { schemaVersion: 2, dayId: window.dayId, requestId: 'refresh-1' },
        now,
      ),
    ).rejects.toMatchObject({ response: { code: 'not_member' } });
  });

  it('uses one free refresh, then atomically spends the configured member points', async () => {
    const { store, playerService, refreshService, rewardNotificationService } = createServices();
    rewardNotificationService.getRecentRewards.mockResolvedValue([{ rewardId: 'reward-1' }]);
    store.accounts.set(483215844, {
      member: {
        id: '483215844',
        steamId: 483215844,
        level: 1,
        expireDate: new Date('2099-12-31T23:59:59.000Z'),
      },
      player: {
        id: '483215844',
        memberPointTotal: 100,
        usedMemberPoint: 0,
      },
    });
    const initial = await playerService.getSnapshot(483215844, now);

    const free = await refreshService.refresh(
      483215844,
      { schemaVersion: 2, dayId: window.dayId, requestId: 'refresh-free' },
      now,
    );
    const paid = await refreshService.refresh(
      483215844,
      { schemaVersion: 2, dayId: window.dayId, requestId: 'refresh-paid' },
      now,
    );
    const duplicate = await refreshService.refresh(
      483215844,
      { schemaVersion: 2, dayId: window.dayId, requestId: 'refresh-paid' },
      now,
    );

    expect(free.costMemberPoint).toBe(0);
    expect(paid.costMemberPoint).toBe(10);
    expect((paid as { memberPointBalance?: number }).memberPointBalance).toBe(90);
    expect((duplicate as { memberPointBalance?: number }).memberPointBalance).toBe(90);
    expect(duplicate).toEqual(paid);
    expect(store.accounts.get(483215844)?.player.usedMemberPoint).toBe(10);
    expect(free.snapshot.candidates.map((item) => item.taskId)).not.toEqual(
      initial.candidates.map((item) => item.taskId),
    );
    expect(paid.snapshot.refresh.paidRefreshesUsed).toBe(1);
    expect(paid.snapshot.refresh.nextCostMemberPoint).toBe(20);
    expect(paid.snapshot.recentRewards).toEqual([{ rewardId: 'reward-1' }]);
  });

  it('serializes concurrent duplicate refreshes so points are deducted once', async () => {
    const { store, playerService, refreshService } = createServices();
    store.accounts.set(483215844, {
      member: {
        id: '483215844',
        steamId: 483215844,
        level: 1,
        expireDate: new Date('2099-12-31T23:59:59.000Z'),
      },
      player: {
        id: '483215844',
        memberPointTotal: 100,
        usedMemberPoint: 0,
      },
    });
    await playerService.getSnapshot(483215844, now);
    await refreshService.refresh(
      483215844,
      { schemaVersion: 2, dayId: window.dayId, requestId: 'consume-free' },
      now,
    );

    const [first, second] = await Promise.all([
      refreshService.refresh(
        483215844,
        {
          schemaVersion: 2,
          dayId: window.dayId,
          requestId: 'same-paid-request',
        },
        now,
      ),
      refreshService.refresh(
        483215844,
        {
          schemaVersion: 2,
          dayId: window.dayId,
          requestId: 'same-paid-request',
        },
        now,
      ),
    ]);

    expect(second).toEqual(first);
    expect(store.accounts.get(483215844)?.player.usedMemberPoint).toBe(10);
  });

  it('returns displayable states for insufficient balance, selected tasks and refresh limits', async () => {
    const { store, playerService, refreshService } = createServices();
    store.accounts.set(483215844, {
      member: {
        id: '483215844',
        steamId: 483215844,
        level: 1,
        expireDate: new Date('2099-12-31T23:59:59.000Z'),
      },
      player: {
        id: '483215844',
        memberPointTotal: 0,
        usedMemberPoint: 0,
      },
    });
    await playerService.getSnapshot(483215844, now);
    await refreshService.refresh(
      483215844,
      { schemaVersion: 2, dayId: window.dayId, requestId: 'free' },
      now,
    );

    await expect(
      refreshService.refresh(
        483215844,
        { schemaVersion: 2, dayId: window.dayId, requestId: 'no-balance' },
        now,
      ),
    ).rejects.toMatchObject({
      response: { code: 'insufficient_member_points' },
    });

    const state = [...store.states.values()][0];
    state.paidRefreshesUsed = config.refreshCostsMemberPoint.length;
    store.states.set(state.id, state);
    await expect(
      refreshService.refresh(
        483215844,
        { schemaVersion: 2, dayId: window.dayId, requestId: 'limit' },
        now,
      ),
    ).rejects.toMatchObject({ response: { code: 'refresh_limit_reached' } });

    state.paidRefreshesUsed = 0;
    state.acceptedTask = state.candidates[0];
    store.states.set(state.id, state);
    await expect(
      refreshService.refresh(
        483215844,
        { schemaVersion: 2, dayId: window.dayId, requestId: 'selected' },
        now,
      ),
    ).rejects.toMatchObject({ response: { code: 'already_selected' } });
  });

  it('rejects refreshing after all personal rounds are completed', async () => {
    const { store, playerService, refreshService } = createServices();
    store.accounts.set(483215844, {
      member: {
        id: '483215844',
        steamId: 483215844,
        level: 1,
        expireDate: new Date('2099-12-31T23:59:59.000Z'),
      },
      player: {
        id: '483215844',
        memberPointTotal: 100,
        usedMemberPoint: 0,
      },
    });
    await playerService.getSnapshot(483215844, now);
    const state = [...store.states.values()][0];
    state.completedAt = now;
    state.completedRoundCount = state.totalRounds;
    state.candidates = [];
    state.acceptedTask = undefined;
    store.states.set(state.id, state);

    await expect(
      refreshService.refresh(
        483215844,
        {
          schemaVersion: 2,
          dayId: window.dayId,
          requestId: 'completed-refresh',
        },
        now,
      ),
    ).rejects.toMatchObject({
      response: { code: 'day_closed', message: '今日个人挑战已全部完成' },
    });
  });

  it('rejects accepting a stale candidate after all personal rounds are completed', async () => {
    const { store, playerService } = createServices();
    const snapshot = await playerService.getSnapshot(483215844, now);
    const staleCandidate = snapshot.candidates[0];
    const state = [...store.states.values()][0];
    state.completedAt = now;
    state.completedRoundCount = state.totalRounds;
    state.candidates = [staleCandidate];
    state.acceptedTask = undefined;
    store.states.set(state.id, state);

    await expect(
      playerService.accept(
        483215844,
        {
          schemaVersion: 2,
          dayId: window.dayId,
          assignmentId: staleCandidate.assignmentId,
          requestId: 'completed-accept',
        },
        now,
      ),
    ).rejects.toMatchObject({
      response: { code: 'day_closed', message: '今日个人挑战已全部完成' },
    });
  });
});
