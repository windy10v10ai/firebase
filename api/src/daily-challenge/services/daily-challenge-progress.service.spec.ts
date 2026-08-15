import { DailyChallengeMatchContributionDto } from '../dto/daily-challenge-match-contribution.dto';
import { DailyChallengeGlobalContribution } from '../entities/daily-challenge-global-contribution.entity';
import { DailyChallengeMatchLedger } from '../entities/daily-challenge-match-ledger.entity';
import { DailyChallengeRewardLedger } from '../entities/daily-challenge-reward-ledger.entity';
import { PlayerDailyChallenge } from '../entities/player-daily-challenge.entity';
import {
  ChallengeMetric,
  ChallengeScope,
  ChallengeUnit,
  DAILY_CHALLENGE_METRIC_UNIT,
  DailyChallengeRewardSource,
} from '../types/daily-challenge.types';

import { DailyChallengeGenerationService } from './daily-challenge-generation.service';
import { DailyChallengeProgressService } from './daily-challenge-progress.service';
import {
  DailyChallengeMatchContributionMutation,
  DailyChallengeMatchContributionResult,
} from './daily-challenge-progress.store';

const now = new Date('2026-08-04T03:00:00.000Z');

const createState = (overrides: Partial<PlayerDailyChallenge> = {}): PlayerDailyChallenge => ({
  id: '2026-08-04_483215844',
  schemaVersion: 2,
  steamId: 483215844,
  dayId: '2026-08-04',
  configVersionId: 'v1',
  configVersion: 1,
  startsAt: new Date('2026-08-03T16:00:00.000Z'),
  endsAt: new Date('2026-08-04T16:00:00.000Z'),
  globalTask: {
    assignmentId: 'global-assignment-1',
    taskId: 'global-damage',
    configVersion: 1,
    scope: ChallengeScope.GLOBAL,
    metric: ChallengeMetric.HERO_DAMAGE,
    unit: ChallengeUnit.DAMAGE,
    target: 1000000,
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
  totalRounds: 3,
  currentRound: 1,
  completedRoundCount: 0,
  completedTasks: [],
  candidates: [],
  seenTaskIds: [],
  refreshCostsMemberPoint: [10],
  refreshIndex: 0,
  freeRefreshUsed: false,
  paidRefreshesUsed: 0,
  acceptedTask: {
    assignmentId: 'assignment-1',
    taskId: 'lina-damage',
    configVersion: 1,
    star: 2,
    round: 1,
    totalRounds: 3,
    scope: ChallengeScope.PERSONAL_HERO,
    metric: ChallengeMetric.HERO_DAMAGE,
    heroName: 'npc_dota_hero_lina',
    unit: ChallengeUnit.DAMAGE,
    target: 500000,
    progress: 0,
    rewardSeasonPoint: 100,
  },
  acceptedAt: new Date('2026-08-04T01:00:00.000Z'),
  progress: 0,
  unreadRewardCount: 0,
  streakDays: 0,
  streakMilestones: [{ days: 3, rewardSeasonPoint: 100 }],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const createContribution = (
  overrides: Partial<DailyChallengeMatchContributionDto['players'][number]> = {},
): DailyChallengeMatchContributionDto => ({
  schemaVersion: 2,
  dataVersion: 1,
  dayId: '2026-08-04',
  matchStartedAt: '2026-08-04T01:00:00.000Z',
  players: [
    {
      steamId: 483215844,
      normallySettled: true,
      acceptedAssignmentId: 'assignment-1',
      personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 300000 }],
      globalMetrics: [],
      ...overrides,
    },
  ],
});

const createLedgerId = (
  matchId: string,
  dayId = '2026-08-04',
  matchStartedAt = '2026-08-04T01:00:00.000Z',
  steamId = 483215844,
) => `${dayId}_${new Date(matchStartedAt).getTime()}_${encodeURIComponent(matchId)}_${steamId}`;

type MatchContributionMutator = (
  state: PlayerDailyChallenge | null,
  globalContribution: DailyChallengeGlobalContribution | null,
) => DailyChallengeMatchContributionMutation;

class MemoryProgressStore {
  readonly states = new Map<string, PlayerDailyChallenge>();
  readonly ledgers = new Map<string, DailyChallengeMatchLedger>();
  readonly globalContributions = new Map<string, DailyChallengeGlobalContribution>();
  readonly rewards = new Map<string, DailyChallengeRewardLedger>();

  async getState(stateId: string) {
    const state = this.states.get(stateId);
    return state ? structuredClone(state) : null;
  }

  async runMatchContribution(
    ledgerId: string,
    stateId: string,
    globalContributionIdOrMutate: string | MatchContributionMutator,
    maybeMutate?: MatchContributionMutator,
  ): Promise<DailyChallengeMatchContributionResult> {
    const existing = this.ledgers.get(ledgerId);
    if (existing) {
      return { ledger: structuredClone(existing), ledgerCreated: false };
    }

    const state = this.states.get(stateId);
    const globalContributionId =
      typeof globalContributionIdOrMutate === 'string' ? globalContributionIdOrMutate : stateId;
    const mutate =
      typeof globalContributionIdOrMutate === 'string'
        ? maybeMutate!
        : globalContributionIdOrMutate;
    const globalContribution = this.globalContributions.get(globalContributionId);
    const mutation = mutate(
      state ? structuredClone(state) : null,
      globalContribution ? structuredClone(globalContribution) : null,
    );

    let personalRewardGrant: DailyChallengeMatchContributionResult['personalRewardGrant'];
    if (mutation.personalReward) {
      const existingReward = this.rewards.get(mutation.personalReward.id);
      const reward = existingReward ?? mutation.personalReward;
      personalRewardGrant = {
        reward: structuredClone(reward),
        created: !existingReward,
      };
      if (!existingReward) {
        this.rewards.set(mutation.personalReward.id, structuredClone(mutation.personalReward));
      }
    }

    if (mutation.state) this.states.set(stateId, structuredClone(mutation.state));
    if (mutation.globalContribution) {
      this.globalContributions.set(
        globalContributionId,
        structuredClone(mutation.globalContribution),
      );
    }
    const ledger = {
      id: ledgerId,
      ...mutation.ledger,
      ...(mutation.personalReward ? { personalRewardLedgerId: mutation.personalReward.id } : {}),
    };
    this.ledgers.set(ledgerId, structuredClone(ledger));
    return {
      ledger,
      ledgerCreated: true,
      ...(personalRewardGrant ? { personalRewardGrant } : {}),
    };
  }
}

const getLedger = (store: MemoryProgressStore, matchId: string) =>
  [...store.ledgers.values()].find((ledger) => ledger.matchId === matchId);

const createService = (store: MemoryProgressStore = new MemoryProgressStore()) => {
  store.states.set('2026-08-04_483215844', createState());
  const clock = {
    getWindow: jest.fn(() => ({ dayId: '2026-08-04' })),
  };
  const rewardService = {
    buildPersonalReward: jest
      .fn()
      .mockImplementation(
        (
          dayId: string,
          steamId: number,
          taskSnapshot: PlayerDailyChallenge['acceptedTask'],
          configVersionId: string,
          configVersion: number,
          grantedAt: Date,
          notificationStatus: 'pending' | 'notified' = 'pending',
        ) => ({
          id: `${dayId}_${steamId}_personal_${taskSnapshot?.assignmentId}`,
          dayId,
          steamId,
          source: 'personal',
          assignmentId: taskSnapshot?.assignmentId,
          taskSnapshot,
          configVersionId,
          configVersion,
          seasonPoint: taskSnapshot?.rewardSeasonPoint ?? 0,
          notificationStatus,
          ...(notificationStatus === 'notified' ? { notifiedAt: grantedAt } : {}),
          createdAt: grantedAt,
        }),
      ),
    grantPersonal: jest
      .fn()
      .mockImplementation(
        (
          dayId: string,
          steamId: number,
          taskSnapshot: PlayerDailyChallenge['acceptedTask'],
          _configVersionId: string,
          _configVersion: number,
          grantedAt: Date,
        ) =>
          Promise.resolve({
            created: true,
            reward: {
              id: `${dayId}_${steamId}_personal_${taskSnapshot?.assignmentId}`,
              dayId,
              steamId,
              source: 'personal',
              assignmentId: taskSnapshot?.assignmentId,
              taskSnapshot,
              seasonPoint: taskSnapshot?.rewardSeasonPoint ?? 0,
              notificationStatus: 'notified',
              notifiedAt: grantedAt,
              createdAt: grantedAt,
            },
          }),
      ),
  };
  const generationService = new DailyChallengeGenerationService();
  const playerService = {
    createTaskSnapshots: jest
      .fn()
      .mockImplementation(
        (
          tasks,
          dayId,
          steamId,
          currentRound,
          totalRounds,
          refreshIndex,
          configVersion,
          personalConfig,
        ) =>
          tasks.map((task) => ({
            assignmentId: `${dayId}-${steamId}-round-${currentRound}-refresh-${refreshIndex}-${task.id}`,
            taskId: task.id,
            configVersion,
            scope: task.scope,
            metric: task.metric,
            ...(task.heroName ? { heroName: task.heroName } : {}),
            unit: DAILY_CHALLENGE_METRIC_UNIT[task.metric],
            star: task.star,
            round: currentRound,
            totalRounds,
            target: Math.max(
              1,
              Math.round(task.target * personalConfig.defaultStarMultipliers[task.star]),
            ),
            progress: 0,
            rewardSeasonPoint: personalConfig.starRewards[task.star],
          })),
      ),
  };
  return {
    store,
    clock,
    rewardService,
    generationService,
    playerService,
    service: new DailyChallengeProgressService(
      ...([
        store,
        clock,
        rewardService,
        generationService,
        playerService,
      ] as unknown as ConstructorParameters<typeof DailyChallengeProgressService>),
    ),
  };
};

describe('DailyChallengeProgressService', () => {
  it('caps the completed task and advances from round one without completing the day', async () => {
    const { service, store } = createService();

    await service.applyGameEnd(
      'match-1',
      createContribution(),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );
    await service.applyGameEnd(
      'match-2',
      createContribution({
        personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 300000 }],
      }),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      new Date('2026-08-04T04:00:00.000Z'),
    );

    const state = store.states.get('2026-08-04_483215844')!;
    expect(state.progress).toBe(0);
    expect(state.acceptedTask).toBeUndefined();
    expect(state.completedTasks).toEqual([
      expect.objectContaining({
        assignmentId: 'assignment-1',
        progress: 500000,
      }),
    ]);
    expect(state.completedRoundCount).toBe(1);
    expect(state.currentRound).toBe(2);
    expect(state.candidates).toHaveLength(3);
    expect(state.candidates.every((candidate) => candidate.round === 2)).toBe(true);
    expect(state.completedAt).toBeUndefined();
  });

  it('grants the personal season-point reward immediately when this match first completes the task', async () => {
    const { service, store, rewardService } = createService();

    const result = await service.applyGameEnd(
      'match-completes-task',
      createContribution({
        personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 500000 }],
      }),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(rewardService.buildPersonalReward).toHaveBeenCalledWith(
      '2026-08-04',
      483215844,
      expect.objectContaining({
        assignmentId: 'assignment-1',
        rewardSeasonPoint: 100,
      }),
      'v1',
      1,
      now,
      'notified',
    );
    expect(rewardService.grantPersonal).not.toHaveBeenCalled();
    expect(store.rewards.size).toBe(1);
    expect(getLedger(store, 'match-completes-task')).toMatchObject({
      personalRewardLedgerId: '2026-08-04_483215844_personal_assignment-1',
    });
    expect(result.rewards).toEqual([
      expect.objectContaining({
        steamId: 483215844,
        source: 'personal',
        seasonPoint: 100,
        assignmentId: 'assignment-1',
      }),
    ]);
  });
  it('replays the same personal reward when game/end is retried without granting points twice', async () => {
    const { service, store, rewardService } = createService();
    const contribution = createContribution({
      personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 500000 }],
    });

    const first = await service.applyGameEnd(
      'match-retry-reward',
      contribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );
    const stateAfterFirst = structuredClone(store.states.get('2026-08-04_483215844'));
    const retry = await service.applyGameEnd(
      'match-retry-reward',
      contribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(first.rewards).toEqual([
      expect.objectContaining({
        steamId: 483215844,
        source: 'personal',
        seasonPoint: 100,
        assignmentId: 'assignment-1',
      }),
    ]);
    expect(retry.rewards).toEqual(first.rewards);
    expect(rewardService.buildPersonalReward).toHaveBeenCalledTimes(1);
    expect(rewardService.grantPersonal).not.toHaveBeenCalled();
    expect(store.rewards.size).toBe(1);
    expect(store.states.get('2026-08-04_483215844')).toEqual(stateAfterFirst);
    expect(stateAfterFirst).toMatchObject({
      currentRound: 2,
      completedRoundCount: 1,
    });
  });

  it.each([true, false])(
    'replays a legacy markerless ledger reward after compatibility grant (created=%s)',
    async (created) => {
      const store = new MemoryProgressStore();
      const { service, rewardService } = createService(store);
      const taskSnapshot = createState().acceptedTask!;
      const reward = {
        id: '2026-08-04_483215844_personal_assignment-1',
        dayId: '2026-08-04',
        steamId: 483215844,
        source: 'personal',
        assignmentId: 'assignment-1',
        taskSnapshot,
        configVersionId: 'v1',
        configVersion: 1,
        seasonPoint: 100,
        notificationStatus: 'notified',
        notifiedAt: now,
        createdAt: now,
      };
      const legacyLedgerId = createLedgerId('match-legacy-reward');
      store.ledgers.set(legacyLedgerId, {
        id: legacyLedgerId,
        matchId: 'match-legacy-reward',
        steamId: 483215844,
        dayId: '2026-08-04',
        normallySettled: true,
        acceptedAssignmentId: 'assignment-1',
        metric: ChallengeMetric.HERO_DAMAGE,
        reportedValue: 500000,
        appliedPersonalProgress: 500000,
        personalReward: {
          taskSnapshot,
          configVersionId: 'v1',
          configVersion: 1,
        },
        reportedGlobalValue: 0,
        appliedGlobalContribution: 0,
        createdAt: now,
      });
      rewardService.grantPersonal.mockResolvedValueOnce({ created, reward });

      const result = await service.applyGameEnd(
        'match-legacy-reward',
        createContribution({
          personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 500000 }],
        }),
        [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
        now,
      );

      expect(rewardService.buildPersonalReward).not.toHaveBeenCalled();
      expect(rewardService.grantPersonal).toHaveBeenCalledWith(
        '2026-08-04',
        483215844,
        expect.objectContaining({ assignmentId: 'assignment-1' }),
        'v1',
        1,
        now,
        'notified',
      );
      expect(result.rewards).toEqual([
        expect.objectContaining({
          steamId: 483215844,
          source: 'personal',
          seasonPoint: 100,
          assignmentId: 'assignment-1',
        }),
      ]);
    },
  );
  it('reports a transaction reward even when its idempotent reward ledger already exists', async () => {
    const store = new MemoryProgressStore();
    const existingReward: DailyChallengeRewardLedger = {
      id: '2026-08-04_483215844_personal_assignment-1',
      dayId: '2026-08-04',
      steamId: 483215844,
      source: DailyChallengeRewardSource.PERSONAL,
      assignmentId: 'assignment-1',
      taskSnapshot: createState().acceptedTask!,
      configVersionId: 'v1',
      configVersion: 1,
      seasonPoint: 100,
      notificationStatus: 'notified',
      notifiedAt: now,
      createdAt: now,
    };
    store.rewards.set(existingReward.id, existingReward);
    const { service, rewardService } = createService(store);

    const result = await service.applyGameEnd(
      'match-existing-personal-reward',
      createContribution({
        personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 500000 }],
      }),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(rewardService.buildPersonalReward).toHaveBeenCalledWith(
      '2026-08-04',
      483215844,
      expect.objectContaining({
        assignmentId: 'assignment-1',
        rewardSeasonPoint: 100,
      }),
      'v1',
      1,
      now,
      'notified',
    );
    expect(rewardService.grantPersonal).not.toHaveBeenCalled();
    expect(store.rewards.size).toBe(1);
    expect(result.rewards).toEqual([
      expect.objectContaining({
        steamId: 483215844,
        source: 'personal',
        seasonPoint: 100,
        assignmentId: 'assignment-1',
      }),
    ]);
  });
  it('does not grant a personal reward before the accepted task reaches its target', async () => {
    const { service, rewardService } = createService();

    const result = await service.applyGameEnd(
      'match-not-complete',
      createContribution(),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(rewardService.buildPersonalReward).not.toHaveBeenCalled();
    expect(rewardService.grantPersonal).not.toHaveBeenCalled();
    expect(result.rewards).toEqual([]);
  });

  it('does not treat a repeated local match id from another challenge day as the same match', async () => {
    const { service, store, clock } = createService();
    (clock.getWindow as jest.Mock).mockImplementation((date: Date) => ({
      dayId: date.toISOString().slice(0, 10),
    }));
    store.states.set(
      '2026-08-03_483215844',
      createState({
        id: '2026-08-03_483215844',
        dayId: '2026-08-03',
        startsAt: new Date('2026-08-02T16:00:00.000Z'),
        endsAt: new Date('2026-08-03T16:00:00.000Z'),
        acceptedAt: new Date('2026-08-03T01:00:00.000Z'),
      }),
    );
    const previousDayContribution = createContribution({
      personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 100000 }],
    });
    previousDayContribution.dayId = '2026-08-03';
    previousDayContribution.matchStartedAt = '2026-08-03T01:00:00.000Z';

    await service.applyGameEnd(
      '0',
      previousDayContribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      new Date('2026-08-03T03:00:00.000Z'),
    );
    const currentDayResult = await service.applyGameEnd(
      '0',
      createContribution({
        personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 500000 }],
      }),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.ledgers.size).toBe(2);
    expect(store.states.get('2026-08-04_483215844')).toMatchObject({
      currentRound: 2,
      completedRoundCount: 1,
    });
    expect(currentDayResult.rewards).toEqual([
      expect.objectContaining({
        steamId: 483215844,
        source: 'personal',
        seasonPoint: 100,
        assignmentId: 'assignment-1',
      }),
    ]);
  });

  it('separates repeated local match ids by match start time within the same challenge day', async () => {
    const { service, store } = createService();
    const state = createState({
      acceptedTask: {
        ...createState().acceptedTask!,
        scope: ChallengeScope.PERSONAL_GENERAL,
        metric: ChallengeMetric.PHYSICAL_DAMAGE,
        target: 300000,
        rewardSeasonPoint: 100,
      },
    });
    store.states.set(state.id, state);
    const firstContribution = createContribution({
      personalMetrics: [{ metric: ChallengeMetric.PHYSICAL_DAMAGE, value: 100000 }],
    });
    firstContribution.dataVersion = 2;
    const completedContribution = createContribution({
      personalMetrics: [{ metric: ChallengeMetric.PHYSICAL_DAMAGE, value: 593629 }],
    });
    completedContribution.dataVersion = 2;
    completedContribution.matchStartedAt = '2026-08-04T02:00:00.000Z';

    await service.applyGameEnd(
      '0',
      firstContribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );
    const result = await service.applyGameEnd(
      '0',
      completedContribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.ledgers.size).toBe(2);
    expect(store.states.get(state.id)).toMatchObject({
      currentRound: 2,
      completedRoundCount: 1,
      completedTasks: [
        expect.objectContaining({
          assignmentId: 'assignment-1',
          metric: ChallengeMetric.PHYSICAL_DAMAGE,
          progress: 300000,
        }),
      ],
    });
    expect(result.rewards).toEqual([
      expect.objectContaining({
        seasonPoint: 100,
        assignmentId: 'assignment-1',
      }),
    ]);
  });

  it('is idempotent for the same match and player ledger', async () => {
    const { service, store } = createService();
    const contribution = createContribution();

    await service.applyGameEnd(
      'match-1',
      contribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );
    await service.applyGameEnd(
      'match-1',
      contribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.states.get('2026-08-04_483215844')?.progress).toBe(300000);
    expect(store.ledgers.size).toBe(1);
  });

  it('rewards all three rounds immediately and completes the day only after round three', async () => {
    const { service, store, rewardService } = createService();
    const makeTask = (round: number, star: 1 | 2 | 3, rewardSeasonPoint: number) => ({
      ...createState().acceptedTask!,
      assignmentId: `round-${round}`,
      taskId: `round-${round}-damage`,
      scope: ChallengeScope.PERSONAL_GENERAL,
      heroName: undefined,
      star,
      round,
      target: 1,
      progress: 0,
      rewardSeasonPoint,
    });
    store.states.set(
      '2026-08-04_483215844',
      createState({
        refreshIndex: 4,
        freeRefreshUsed: true,
        paidRefreshesUsed: 3,
        acceptedTask: makeTask(1, 1, 80),
      }),
    );

    const rewardsByRound: number[][] = [];
    for (const [round, star, rewardSeasonPoint] of [
      [1, 1, 80],
      [2, 2, 100],
      [3, 3, 120],
    ] as const) {
      if (round > 1) {
        const state = store.states.get('2026-08-04_483215844')!;
        state.acceptedTask = makeTask(round, star, rewardSeasonPoint);
        state.acceptedAt = new Date('2026-08-04T01:00:00.000Z');
        state.progress = 0;
        store.states.set(state.id, state);
      }
      const completedAt = new Date(`2026-08-04T0${round + 1}:00:00.000Z`);
      const result = await service.applyGameEnd(
        `match-round-${round}`,
        createContribution({
          acceptedAssignmentId: `round-${round}`,
          personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 1 }],
        }),
        [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
        completedAt,
      );
      rewardsByRound.push(result.rewards.map((reward) => reward.seasonPoint));

      const stateAfterRound = store.states.get('2026-08-04_483215844')!;
      expect(stateAfterRound.completedRoundCount).toBe(round);
      if (round < 3) {
        expect(stateAfterRound.completedAt).toBeUndefined();
      } else {
        expect(stateAfterRound.completedAt).toEqual(completedAt);
      }
    }

    const state = store.states.get('2026-08-04_483215844')!;
    expect(state).toMatchObject({
      totalRounds: 3,
      currentRound: 3,
      completedRoundCount: 3,
      refreshIndex: 4,
      freeRefreshUsed: true,
      paidRefreshesUsed: 3,
      progress: 0,
    });
    expect(state.completedTasks.map((task) => [task.star, task.rewardSeasonPoint])).toEqual([
      [1, 80],
      [2, 100],
      [3, 120],
    ]);
    expect(rewardsByRound).toEqual([[80], [100], [120]]);
    expect(state.completedAt).toEqual(new Date('2026-08-04T04:00:00.000Z'));
    expect(state.acceptedTask).toBeUndefined();
    expect(state.candidates).toEqual([]);
    expect(store.rewards.size).toBe(3);
    expect(rewardService.buildPersonalReward).toHaveBeenCalledTimes(3);
    expect(rewardService.grantPersonal).not.toHaveBeenCalled();
  });
  it('accumulates global contribution for every eligible participant without personal acceptance', async () => {
    const { service, store } = createService();
    store.states.set(
      '2026-08-04_483215844',
      createState({ acceptedTask: undefined, acceptedAt: undefined }),
    );

    await service.applyGameEnd(
      'match-global-1',
      createContribution({
        acceptedAssignmentId: undefined,
        personalMetrics: [],
        globalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 120000 }],
      }),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.globalContributions.get('2026-08-04_483215844')).toMatchObject({
      dayId: '2026-08-04',
      steamId: 483215844,
      assignmentId: 'global-assignment-1',
      metric: ChallengeMetric.HERO_DAMAGE,
      value: 120000,
    });
    expect(getLedger(store, 'match-global-1')).toMatchObject({
      reportedGlobalValue: 120000,
      appliedGlobalContribution: 120000,
    });
  });

  it.each([
    ['not normally settled', { normallySettled: false }, true],
    ['not eligible in base settlement', {}, false],
    [
      'global metric mismatch',
      { globalMetrics: [{ metric: ChallengeMetric.HEALING, value: 120000 }] },
      true,
    ],
  ])('does not accumulate global contribution when %s', async (_name, overrides, eligible) => {
    const { service, store } = createService();

    await service.applyGameEnd(
      'match-global-rejected',
      createContribution({
        acceptedAssignmentId: undefined,
        personalMetrics: [],
        globalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 120000 }],
        ...(overrides as Partial<DailyChallengeMatchContributionDto['players'][number]>),
      }),
      eligible ? [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }] : [],
      now,
    );

    expect(store.globalContributions.size).toBe(0);
    expect(getLedger(store, 'match-global-rejected')).toMatchObject({
      appliedGlobalContribution: 0,
    });
  });

  it('does not apply the same match global contribution twice', async () => {
    const { service, store } = createService();
    const contribution = createContribution({
      acceptedAssignmentId: undefined,
      personalMetrics: [],
      globalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 120000 }],
    });

    await service.applyGameEnd(
      'match-global-idempotent',
      contribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );
    await service.applyGameEnd(
      'match-global-idempotent',
      contribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.globalContributions.get('2026-08-04_483215844')?.value).toBe(120000);
    expect(store.ledgers.size).toBe(1);
  });

  it('does not overwrite contribution from a different global assignment', async () => {
    const { service, store } = createService();
    store.globalContributions.set('2026-08-04_483215844', {
      id: '2026-08-04_483215844',
      dayId: '2026-08-04',
      steamId: 483215844,
      assignmentId: 'previous-global-assignment',
      metric: ChallengeMetric.HERO_DAMAGE,
      value: 90000,
      createdAt: now,
      updatedAt: now,
    });

    await service.applyGameEnd(
      'match-global-assignment-mismatch',
      createContribution({
        acceptedAssignmentId: undefined,
        personalMetrics: [],
        globalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 120000 }],
      }),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.globalContributions.get('2026-08-04_483215844')).toMatchObject({
      assignmentId: 'previous-global-assignment',
      value: 90000,
    });
    expect(getLedger(store, 'match-global-assignment-mismatch')).toMatchObject({
      appliedGlobalContribution: 0,
    });
  });

  it('does not apply personal progress when the task was accepted more than ten minutes after match start', async () => {
    const { service, store } = createService();
    store.states.set(
      '2026-08-04_483215844',
      createState({ acceptedAt: new Date('2026-08-04T01:10:01.000Z') }),
    );

    await service.applyGameEnd(
      'match-late-accept',
      createContribution(),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.states.get('2026-08-04_483215844')?.progress).toBe(0);
    expect(getLedger(store, 'match-late-accept')).toMatchObject({
      appliedPersonalProgress: 0,
    });
  });

  it('uses the metric minimum data version for personal progress when the snapshot is stale', async () => {
    const { service, store } = createService();
    const state = createState();
    state.acceptedTask = {
      ...state.acceptedTask!,
      metric: ChallengeMetric.PHYSICAL_DAMAGE,
      unit: ChallengeUnit.DAMAGE,
      target: 500000,
    };
    store.states.set(state.id, state);
    const contribution = createContribution({
      personalMetrics: [{ metric: ChallengeMetric.PHYSICAL_DAMAGE, value: 300000 }],
    });
    contribution.dataVersion = 1;

    await service.applyGameEnd(
      'match-stale-personal-min-version',
      contribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.states.get(state.id)?.progress).toBe(0);
    expect(getLedger(store, 'match-stale-personal-min-version')).toMatchObject({
      reportedValue: 300000,
      appliedPersonalProgress: 0,
    });
  });

  it('uses the metric minimum data version for global progress when the snapshot is stale', async () => {
    const { service, store } = createService();
    const state = createState();
    state.globalTask = {
      ...state.globalTask!,
      metric: ChallengeMetric.BOT_KILLS,
      unit: ChallengeUnit.COUNT,
      target: 100,
    };
    store.states.set(state.id, state);
    const contribution = createContribution({
      acceptedAssignmentId: undefined,
      personalMetrics: [],
      globalMetrics: [{ metric: ChallengeMetric.BOT_KILLS, value: 20 }],
    });
    contribution.dataVersion = 1;

    await service.applyGameEnd(
      'match-stale-global-min-version',
      contribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.globalContributions.size).toBe(0);
    expect(getLedger(store, 'match-stale-global-min-version')).toMatchObject({
      reportedGlobalValue: 20,
      appliedGlobalContribution: 0,
    });
  });

  it('uses matchStartedAt for challenge-day attribution', async () => {
    const { service, store, clock } = createService();
    clock.getWindow.mockReturnValue({ dayId: '2026-08-03' });

    await service.applyGameEnd(
      'match-1',
      createContribution(),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(clock.getWindow).toHaveBeenCalledWith(new Date('2026-08-04T01:00:00.000Z'));
    expect(store.states.get('2026-08-04_483215844')?.progress).toBe(0);
    expect(store.ledgers.size).toBe(0);
  });

  it('allows dataVersion 2 to advance a metric whose minimum version is 2', async () => {
    const { service, store } = createService();
    const state = createState();
    state.acceptedTask = {
      ...state.acceptedTask!,
      metric: 'physical_damage' as ChallengeMetric,
      target: 500000,
    } as NonNullable<PlayerDailyChallenge['acceptedTask']>;
    store.states.set(state.id, state);
    const contribution = createContribution({
      personalMetrics: [{ metric: 'physical_damage' as ChallengeMetric, value: 300000 }],
    });
    contribution.dataVersion = 2;

    await service.applyGameEnd(
      'match-v2-physical-damage',
      contribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.states.get(state.id)?.progress).toBe(300000);
    expect(getLedger(store, 'match-v2-physical-damage')).toMatchObject({
      reportedValue: 300000,
      appliedPersonalProgress: 300000,
    });
  });

  it.each([
    [ChallengeMetric.HERO_DAMAGE, 100000001],
    [ChallengeMetric.KILLS, 1001],
    ['stun_duration_ms' as ChallengeMetric, 86400001],
  ])('rejects an implausible single-match %s contribution', async (metric, value) => {
    const { service, store } = createService();
    const state = createState();
    state.acceptedTask = {
      ...state.acceptedTask!,
      metric,
      target: value * 2,
    } as NonNullable<PlayerDailyChallenge['acceptedTask']>;
    store.states.set(state.id, state);
    const contribution = createContribution({
      personalMetrics: [{ metric, value }],
    });
    contribution.dataVersion = 2;

    await service.applyGameEnd(
      `match-over-limit-${metric}`,
      contribution,
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.states.get(state.id)?.progress).toBe(0);
    expect(getLedger(store, `match-over-limit-${metric}`)).toMatchObject({
      reportedValue: value,
      appliedPersonalProgress: 0,
    });
  });

  it('accepts a contribution exactly at the conservative single-match damage limit', async () => {
    const { service, store } = createService();
    const state = createState();
    state.acceptedTask = {
      ...state.acceptedTask!,
      target: 100000000,
    } as NonNullable<PlayerDailyChallenge['acceptedTask']>;
    store.states.set(state.id, state);

    await service.applyGameEnd(
      'match-at-damage-limit',
      createContribution({
        personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 100000000 }],
      }),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.states.get(state.id)).toMatchObject({
      progress: 0,
      currentRound: 2,
      completedRoundCount: 1,
      completedTasks: [expect.objectContaining({ progress: 100000000 })],
    });
  });

  it('rejects duplicate values for the active personal metric instead of choosing one', async () => {
    const { service, store } = createService();

    await service.applyGameEnd(
      'match-duplicate-metric',
      createContribution({
        personalMetrics: [
          { metric: ChallengeMetric.HERO_DAMAGE, value: 100000 },
          { metric: ChallengeMetric.HERO_DAMAGE, value: 200000 },
        ],
      }),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.states.get('2026-08-04_483215844')?.progress).toBe(0);
    expect(getLedger(store, 'match-duplicate-metric')).toMatchObject({
      reportedValue: 0,
      appliedPersonalProgress: 0,
    });
  });

  it('ignores unknown metric names when validation is bypassed', async () => {
    const { service, store } = createService();

    await service.applyGameEnd(
      'match-unknown-metric',
      createContribution({
        personalMetrics: [
          {
            metric: 'hard_control_target_ms' as ChallengeMetric,
            value: 100000,
          },
        ],
      }),
      [{ steamId: 483215844, heroName: 'npc_dota_hero_lina' }],
      now,
    );

    expect(store.states.get('2026-08-04_483215844')?.progress).toBe(0);
    expect(getLedger(store, 'match-unknown-metric')).toMatchObject({
      reportedValue: 0,
      appliedPersonalProgress: 0,
    });
  });
});
