import { DailyChallengeConfigSnapshot } from '../types/daily-challenge-config.types';
import { ChallengeMetric, ChallengeScope, ChallengeUnit } from '../types/daily-challenge.types';

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

const task = (id: string, scope: ChallengeScope, category: string) => ({
  id,
  revision: 1,
  enabled: true,
  scope,
  metric: ChallengeMetric.HERO_DAMAGE,
  unit: ChallengeUnit.DAMAGE,
  category,
  title: { cn: id, en: id, ru: id },
  description: { cn: id, en: id, ru: id },
  target: 100,
  rewardSeasonPoint: 100,
  weight: 1,
  expectedMatches: 2,
  cooldownDays: 0,
  minDataVersion: 1,
  groupTags: [],
  mutexTags: [],
  ...(scope === ChallengeScope.PERSONAL_HERO ? { heroName: `npc_dota_hero_${id}` } : {}),
});

const config: DailyChallengeConfigSnapshot = {
  id: 'daily-challenge',
  version: 7,
  tasks: [
    task('damage-1', ChallengeScope.PERSONAL_GENERAL, 'damage'),
    task('damage-2', ChallengeScope.PERSONAL_GENERAL, 'damage'),
    task('healing-1', ChallengeScope.PERSONAL_GENERAL, 'healing'),
    task('tower-1', ChallengeScope.PERSONAL_GENERAL, 'tower'),
    task('assist-1', ChallengeScope.PERSONAL_GENERAL, 'assist'),
    task('hero-lina', ChallengeScope.PERSONAL_HERO, 'hero_damage'),
    task('hero-cm', ChallengeScope.PERSONAL_HERO, 'hero_control'),
    task('hero-axe', ChallengeScope.PERSONAL_HERO, 'hero_tank'),
    task('global-bots', ChallengeScope.GLOBAL, 'bot_kills'),
  ],
  globalTargetPolicies: {
    'global-bots': {
      launchTarget: 10000,
      minTarget: 1000,
      maxTarget: 100000,
      perPlayerExpectedContribution: 100,
      completionFactor: 1,
      maxDailyChangeRatio: 0.2,
    },
  },
  globalRewardTiers: {
    topPercent: 10,
    middlePercent: 30,
    topRewardSeasonPoint: 100,
    middleRewardSeasonPoint: 90,
    baseRewardSeasonPoint: 80,
  },
  refreshCostsMemberPoint: [10, 20, 30, 50, 50],
  streakMilestones: [{ days: 3, rewardSeasonPoint: 100 }],
};

class MemoryDailyChallengeDayStore extends DailyChallengeDayStore {
  days = new Map<string, any>();

  async getOrCreate(dayId: string, factory: () => any): Promise<any> {
    if (!this.days.has(dayId)) {
      this.days.set(dayId, structuredClone(factory()));
    }
    return structuredClone(this.days.get(dayId));
  }
}

class MemoryDailyChallengePlayerStore extends DailyChallengePlayerStore {
  states = new Map<string, any>();
  operations = new Map<string, DailyChallengeStoredOperation>();
  accounts = new Map<number, { member: any; player: any }>();
  private queue: Promise<void> = Promise.resolve();

  async getOrCreateState(id: string, factory: () => any): Promise<any> {
    if (!this.states.has(id)) {
      this.states.set(id, factory());
    }
    return structuredClone(this.states.get(id));
  }

  async getState(id: string): Promise<any> {
    const value = this.states.get(id);
    return value ? structuredClone(value) : null;
  }

  async getAccountState(steamId: number): Promise<any> {
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
  const configService = {
    getPublished: jest.fn().mockResolvedValue({ id: 'v7', version: 7, snapshot: config }),
    getVersion: jest.fn().mockResolvedValue({ id: 'v7', version: 7, snapshot: config }),
  };
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
    new MemoryDailyChallengeDayStore(),
    configService as any,
    generation,
    clock as any,
  );
  const playerService = new DailyChallengePlayerService(
    store,
    configService as any,
    dayService,
    generation,
    clock as any,
    rewardNotificationService as any,
    globalProgressStore as any,
  );
  const refreshService = new DailyChallengeRefreshService(
    store,
    configService as any,
    generation,
    clock as any,
    playerService,
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
      return { steamId } as any;
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
    expect(first.candidates.every((candidate) => candidate.revision === 1)).toBe(true);
    expect(new Set(first.candidates.map((candidate) => candidate.assignmentId)).size).toBe(3);
    expect(first.needsSelection).toBe(true);
    expect(first.globalRewardTiers).toEqual(config.globalRewardTiers);
    expect(first.refresh.freeRefreshAvailable).toBe(false);
    expect(first.streak).toEqual({
      currentDays: 0,
      cycleTargetDays: 3,
      nextMilestoneDays: 3,
      nextMilestoneRewardSeasonPoint: 100,
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
      { schemaVersion: 2, dayId: window.dayId, assignmentId, requestId: 'accept-1' },
      now,
    );
    const duplicate = await playerService.accept(
      483215844,
      { schemaVersion: 2, dayId: window.dayId, assignmentId, requestId: 'accept-1' },
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
        { schemaVersion: 2, dayId: window.dayId, requestId: 'same-paid-request' },
        now,
      ),
      refreshService.refresh(
        483215844,
        { schemaVersion: 2, dayId: window.dayId, requestId: 'same-paid-request' },
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
    ).rejects.toMatchObject({ response: { code: 'insufficient_member_points' } });

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
        { schemaVersion: 2, dayId: window.dayId, requestId: 'completed-refresh' },
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
