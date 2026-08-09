import {
  ChallengeMetric,
  ChallengeScope,
  ChallengeUnit,
  DailyChallengeContributionTier,
  DailyChallengeRewardSource,
} from '../types/daily-challenge.types';

import { DailyChallengeRewardService } from './daily-challenge-reward.service';

const now = new Date('2026-08-04T18:00:00.000Z');
const taskSnapshot = {
  assignmentId: 'assignment-1',
  taskId: 'damage-general-1',
  revision: 2,
  configVersion: 7,
  scope: ChallengeScope.PERSONAL_GENERAL,
  metric: ChallengeMetric.HERO_DAMAGE,
  unit: ChallengeUnit.DAMAGE,
  title: { cn: 'Deal Damage', en: 'Deal Damage', ru: 'Deal Damage' },
  description: { cn: 'Deal 500,000 damage', en: 'Deal 500,000 damage', ru: 'Deal 500,000 damage' },
  target: 500000,
  progress: 500000,
  rewardSeasonPoint: 100,
};

describe('DailyChallengeRewardService', () => {
  const createService = () => {
    const store = { grant: jest.fn(async (reward) => ({ reward, created: true })) };
    return {
      service: new DailyChallengeRewardService(
        store as unknown as ConstructorParameters<typeof DailyChallengeRewardService>[0],
      ),
      store,
    };
  };

  it('uses a reconstructable personal reward id and keeps the task assignment', async () => {
    const { service, store } = createService();

    await service.grantPersonal('2026-08-04', 483215844, taskSnapshot, 'v7', 7, now);

    expect(store.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '2026-08-04_483215844_personal_assignment-1',
        source: DailyChallengeRewardSource.PERSONAL,
        assignmentId: 'assignment-1',
        taskSnapshot,
        configVersionId: 'v7',
        configVersion: 7,
        seasonPoint: 100,
        notificationStatus: 'pending',
        createdAt: now,
      }),
    );
  });

  it('can mark an immediately displayed personal reward as notified', async () => {
    const { service, store } = createService();

    await service.grantPersonal('2026-08-04', 483215844, taskSnapshot, 'v7', 7, now, 'notified');

    expect(store.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationStatus: 'notified',
        notifiedAt: now,
      }),
    );
  });

  it('uses one reconstructable global reward id and records its contribution tier', async () => {
    const { service, store } = createService();

    await service.grantGlobal(
      '2026-08-04',
      483215844,
      DailyChallengeContributionTier.TOP,
      100,
      taskSnapshot,
      'v7',
      7,
      now,
    );

    expect(store.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '2026-08-04_483215844_global',
        source: DailyChallengeRewardSource.GLOBAL,
        contributionTier: DailyChallengeContributionTier.TOP,
        taskSnapshot,
        configVersionId: 'v7',
        configVersion: 7,
        seasonPoint: 100,
      }),
    );
  });

  it('separates streak rewards by cycle and milestone day', async () => {
    const { service, store } = createService();

    await service.grantStreak('2026-08-04', 483215844, '2026-07-06', 30, 500, 'v7', 7, now);

    expect(store.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '2026-08-04_483215844_streak_2026-07-06_30',
        source: DailyChallengeRewardSource.STREAK,
        streakCycleId: '2026-07-06',
        streakDays: 30,
        seasonPoint: 500,
        configVersionId: 'v7',
        configVersion: 7,
      }),
    );
  });
});
