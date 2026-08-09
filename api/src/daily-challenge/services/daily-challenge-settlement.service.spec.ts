import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';
import { DailyChallengeGlobalRanking } from '../entities/daily-challenge-global-ranking.entity';
import { PlayerDailyChallenge } from '../entities/player-daily-challenge.entity';
import {
  ChallengeDayStatus,
  ChallengeMetric,
  ChallengeScope,
  ChallengeUnit,
  DailyChallengeContributionTier,
} from '../types/daily-challenge.types';

import { ChallengeDayClockService } from './challenge-day-clock.service';
import { DailyChallengeGlobalFreezeService } from './daily-challenge-global-freeze.service';
import { DailyChallengeRewardService } from './daily-challenge-reward.service';
import { DailyChallengeSettlementService } from './daily-challenge-settlement.service';
import { DailyChallengeSettlementStore } from './daily-challenge-settlement.store';
import { DailyChallengeStreakService } from './daily-challenge-streak.service';

const closesAt = new Date('2026-08-04T02:00:00.000Z');
const now = new Date('2026-08-04T02:01:00.000Z');

const createDay = (overrides: Partial<DailyChallengeDay> = {}): DailyChallengeDay => ({
  id: '2026-08-03',
  schemaVersion: 2,
  dayId: '2026-08-03',
  configVersionId: 'config-v1',
  configVersion: 1,
  globalTask: {
    assignmentId: '2026-08-03-global-damage',
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
  startsAt: new Date('2026-08-02T00:00:00.000Z'),
  endsAt: new Date('2026-08-03T00:00:00.000Z'),
  closesAt,
  status: ChallengeDayStatus.OPEN,
  createdAt: new Date('2026-08-02T00:00:00.000Z'),
  updatedAt: new Date('2026-08-02T00:00:00.000Z'),
  ...overrides,
});

const createCompletedTask = (round: number) => ({
  assignmentId: `personal-${round}`,
  taskId: 'personal-damage',
  revision: 1,
  configVersion: 1,
  star: 2 as const,
  round,
  totalRounds: 3,
  scope: ChallengeScope.PERSONAL_GENERAL,
  metric: ChallengeMetric.HERO_DAMAGE,
  unit: ChallengeUnit.DAMAGE,
  title: { cn: '??', en: 'Damage', ru: 'Damage' },
  description: { cn: '造成伤害', en: 'Deal damage', ru: 'Deal damage' },
  target: 50,
  progress: 50,
  rewardSeasonPoint: 100,
});

const createState = (overrides: Partial<PlayerDailyChallenge> = {}): PlayerDailyChallenge => ({
  id: '2026-08-03_483215844',
  schemaVersion: 2,
  steamId: 483215844,
  dayId: '2026-08-03',
  configVersionId: 'config-v1',
  configVersion: 1,
  startsAt: new Date('2026-08-02T00:00:00.000Z'),
  endsAt: new Date('2026-08-03T00:00:00.000Z'),
  globalRewardTiers: createDay().globalRewardTiers,
  totalRounds: 3,
  currentRound: 3,
  completedRoundCount: 3,
  completedTasks: [createCompletedTask(1), createCompletedTask(2), createCompletedTask(3)],
  candidates: [],
  seenTaskIds: [],
  refreshCostsMemberPoint: [],
  refreshIndex: 0,
  freeRefreshUsed: false,
  paidRefreshesUsed: 0,
  acceptedTask: {
    assignmentId: 'personal-1',
    taskId: 'personal-damage',
    revision: 1,
    configVersion: 1,
    star: 2,
    round: 3,
    totalRounds: 3,
    scope: ChallengeScope.PERSONAL_GENERAL,
    metric: ChallengeMetric.HERO_DAMAGE,
    unit: ChallengeUnit.DAMAGE,
    title: { cn: '伤害', en: 'Damage', ru: 'Damage' },
    description: { cn: '造成伤害', en: 'Deal damage', ru: 'Deal damage' },
    target: 50,
    progress: 50,
    rewardSeasonPoint: 100,
  },
  progress: 50,
  completedAt: new Date('2026-08-02T12:00:00.000Z'),
  unreadRewardCount: 0,
  streakDays: 0,
  streakMilestones: [
    { days: 3, rewardSeasonPoint: 50 },
    { days: 7, rewardSeasonPoint: 100 },
  ],
  createdAt: new Date('2026-08-02T00:00:00.000Z'),
  updatedAt: new Date('2026-08-02T12:00:00.000Z'),
  ...overrides,
});

const streamRankingPages = (pages: DailyChallengeGlobalRanking[][]) =>
  (async function* () {
    for (const page of pages) {
      yield page;
    }
  })();

const createStore = () =>
  ({
    listEndedDays: jest.fn(),
    markClosing: jest.fn(),
    beginRewarding: jest.fn(),
    listPlayerStates: jest.fn(),
    preparePlayerSettlement: jest.fn(),
    streamGlobalRankingPages: jest.fn(),
    completeDay: jest.fn(),
  }) as unknown as jest.Mocked<DailyChallengeSettlementStore>;

const createRewardService = () =>
  ({
    grantPersonal: jest.fn(),
    grantGlobal: jest.fn(),
    grantStreak: jest.fn(),
  }) as unknown as jest.Mocked<DailyChallengeRewardService>;

const createService = (
  store: jest.Mocked<DailyChallengeSettlementStore>,
  freeze: jest.Mocked<DailyChallengeGlobalFreezeService>,
  rewards: jest.Mocked<DailyChallengeRewardService>,
) =>
  new DailyChallengeSettlementService(
    store,
    freeze,
    rewards,
    new DailyChallengeStreakService(),
    new ChallengeDayClockService(),
  );

describe('DailyChallengeSettlementService', () => {
  it('moves an ended day into closing during the grace period without freezing it', async () => {
    const store = createStore();
    const day = createDay({ closesAt: new Date('2026-08-04T04:00:00.000Z') });
    store.listEndedDays.mockResolvedValue([day]);
    store.markClosing.mockResolvedValue({ ...day, status: ChallengeDayStatus.CLOSING });
    const freeze = {
      freeze: jest.fn(),
    } as unknown as jest.Mocked<DailyChallengeGlobalFreezeService>;
    const rewards = createRewardService();

    await createService(store, freeze, rewards).reconcile(now);

    expect(store.markClosing).toHaveBeenCalledWith(day.dayId, now);
    expect(freeze.freeze).not.toHaveBeenCalled();
    expect(store.beginRewarding).not.toHaveBeenCalled();
  });

  it('settles personal, streak, and frozen global rewards before marking the day settled', async () => {
    const store = createStore();
    const day = createDay();
    const frozen = createDay({
      status: ChallengeDayStatus.FROZEN,
      freezeStartedAt: now,
      frozenAt: now,
      globalProgress: 100,
      globalCompleted: true,
      eligibleContributionCount: 1,
    });
    const rewarding = { ...frozen, status: ChallengeDayStatus.REWARDING, rewardingStartedAt: now };
    const state = createState();
    const prepared = createState({
      settlementProcessedAt: now,
      streakDays: 3,
      streakCycleId: '2026-08-01',
      streakRewardDays: 3,
      streakRewardSeasonPoint: 50,
    });
    store.listEndedDays.mockResolvedValue([day]);
    store.markClosing.mockResolvedValue({ ...day, status: ChallengeDayStatus.CLOSING });
    store.beginRewarding.mockResolvedValue(rewarding);
    store.listPlayerStates.mockResolvedValue([state]);
    store.preparePlayerSettlement.mockResolvedValue(prepared);
    store.streamGlobalRankingPages.mockImplementation(() =>
      streamRankingPages([
        [
          {
            id: '2026-08-03_483215844',
            dayId: '2026-08-03',
            steamId: 483215844,
            assignmentId: '2026-08-03-global-damage',
            metric: ChallengeMetric.HERO_DAMAGE,
            value: 100,
            tier: DailyChallengeContributionTier.TOP,
            rewardSeasonPoint: 100,
            frozenAt: now,
          },
        ],
      ]),
    );
    store.completeDay.mockResolvedValue({
      ...rewarding,
      status: ChallengeDayStatus.SETTLED,
      settledAt: now,
    });
    const freeze = {
      freeze: jest.fn().mockResolvedValue(frozen),
    } as unknown as jest.Mocked<DailyChallengeGlobalFreezeService>;
    const rewards = createRewardService();

    await createService(store, freeze, rewards).reconcile(now);

    expect(freeze.freeze).toHaveBeenCalledWith(day.dayId, now);
    expect(store.preparePlayerSettlement).toHaveBeenCalledWith(
      state.id,
      '2026-08-02_483215844',
      now,
      expect.any(Function),
    );
    expect(rewards.grantPersonal).toHaveBeenCalledTimes(3);
    for (const completedTask of state.completedTasks) {
      expect(rewards.grantPersonal).toHaveBeenCalledWith(
        day.dayId,
        state.steamId,
        completedTask,
        state.configVersionId,
        state.configVersion,
        now,
      );
    }
    expect(rewards.grantStreak).toHaveBeenCalledWith(
      day.dayId,
      state.steamId,
      '2026-08-01',
      3,
      50,
      state.configVersionId,
      state.configVersion,
      now,
    );
    expect(rewards.grantGlobal).toHaveBeenCalledWith(
      day.dayId,
      state.steamId,
      DailyChallengeContributionTier.TOP,
      100,
      day.globalTask,
      day.configVersionId,
      day.configVersion,
      now,
    );
    expect(store.completeDay).toHaveBeenCalledWith(day.dayId, now);
  });

  it('does not rebuild frozen rankings when retrying a day already in rewarding', async () => {
    const store = createStore();
    const rewarding = createDay({
      status: ChallengeDayStatus.REWARDING,
      freezeStartedAt: now,
      frozenAt: now,
      rewardingStartedAt: now,
      globalCompleted: false,
    });
    store.listEndedDays.mockResolvedValue([rewarding]);
    store.listPlayerStates.mockResolvedValue([]);
    store.streamGlobalRankingPages.mockImplementation(() => streamRankingPages([]));
    store.completeDay.mockResolvedValue({
      ...rewarding,
      status: ChallengeDayStatus.SETTLED,
      settledAt: now,
    });
    const freeze = {
      freeze: jest.fn(),
    } as unknown as jest.Mocked<DailyChallengeGlobalFreezeService>;
    const rewards = createRewardService();

    await createService(store, freeze, rewards).reconcile(now);

    expect(store.markClosing).not.toHaveBeenCalled();
    expect(freeze.freeze).not.toHaveBeenCalled();
    expect(store.beginRewarding).not.toHaveBeenCalled();
    expect(store.completeDay).toHaveBeenCalled();
  });
});
