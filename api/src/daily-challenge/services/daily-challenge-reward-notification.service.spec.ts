import { DailyChallengeRewardLedger } from '../entities/daily-challenge-reward-ledger.entity';
import {
  DailyChallengeContributionTier,
  DailyChallengeRewardSource,
} from '../types/daily-challenge.types';

import { DailyChallengeRewardNotificationService } from './daily-challenge-reward-notification.service';
import { DailyChallengeRewardStore } from './daily-challenge-reward.store';

const now = new Date('2026-08-04T03:00:00.000Z');

const reward = (overrides: Partial<DailyChallengeRewardLedger>): DailyChallengeRewardLedger => ({
  id: 'reward-1',
  dayId: '2026-08-03',
  steamId: 483215844,
  source: DailyChallengeRewardSource.PERSONAL,
  assignmentId: 'assignment-1',
  seasonPoint: 100,
  notificationStatus: 'pending',
  createdAt: new Date('2026-08-04T02:00:00.000Z'),
  ...overrides,
});

describe('DailyChallengeRewardNotificationService', () => {
  it('claims pending rewards and maps each reward to one game-start point popup', async () => {
    const store = {
      claimPending: jest.fn().mockResolvedValue([
        reward({
          taskSnapshot: {
            assignmentId: 'assignment-1',
            taskId: 'damage-1',
            revision: 1,
            scope: 'personal_general',
            metric: 'hero_damage',
            unit: 'damage',
            title: { cn: '造成伤害', en: 'Deal Damage', ru: 'Deal Damage' },
            description: { cn: '造成伤害', en: 'Deal Damage', ru: 'Deal Damage' },
            target: 100,
            progress: 100,
            rewardSeasonPoint: 100,
          } as any,
          configVersionId: 'daily-v7',
          configVersion: 7,
        }),
        reward({
          id: 'reward-2',
          source: DailyChallengeRewardSource.GLOBAL,
          assignmentId: undefined,
          contributionTier: DailyChallengeContributionTier.TOP,
          seasonPoint: 90,
        }),
      ]),
    } as unknown as jest.Mocked<DailyChallengeRewardStore>;
    const service = new DailyChallengeRewardNotificationService(store);

    const result = await service.claimPointInfo([483215844], now);

    expect(store.claimPending).toHaveBeenCalledWith([483215844], now);
    expect(result).toEqual([
      expect.objectContaining({
        steamId: 483215844,
        seasonPoint: 100,
        title: { cn: '每日挑战完成奖励', en: 'Daily Challenge Reward' },
        dailyChallengeReward: expect.objectContaining({
          dayId: '2026-08-03',
          source: DailyChallengeRewardSource.PERSONAL,
          assignmentId: 'assignment-1',
          configVersionId: 'daily-v7',
          configVersion: 7,
          taskSnapshot: expect.objectContaining({ taskId: 'damage-1' }),
        }),
      }),
      expect.objectContaining({
        seasonPoint: 90,
        title: { cn: '全服共同挑战奖励', en: 'Global Challenge Reward' },
        dailyChallengeReward: expect.objectContaining({
          contributionTier: DailyChallengeContributionTier.TOP,
        }),
      }),
    ]);
  });

  it('delegates unread counting and viewed acknowledgement to the reward ledger store', async () => {
    const store = {
      countUnread: jest.fn().mockResolvedValue(3),
      markViewed: jest.fn().mockResolvedValue(3),
    } as unknown as jest.Mocked<DailyChallengeRewardStore>;
    const service = new DailyChallengeRewardNotificationService(store);

    await expect(service.getUnreadCount(483215844)).resolves.toBe(3);
    await expect(service.markViewed(483215844, now)).resolves.toBe(3);
    expect(store.markViewed).toHaveBeenCalledWith(483215844, now);
  });
  it('maps recent reward ledgers to stable player-facing history records', async () => {
    const taskSnapshot = {
      assignmentId: 'assignment-1',
      taskId: 'damage-1',
      revision: 2,
      scope: 'personal_general',
      metric: 'hero_damage',
      unit: 'damage',
      title: { cn: '造成伤害', en: 'Deal Damage', ru: 'Deal Damage' },
      description: { cn: '造成50万伤害', en: 'Deal 500,000 damage', ru: 'Deal 500,000 damage' },
      target: 500000,
      progress: 500000,
      rewardSeasonPoint: 100,
    } as any;
    const store = {
      listRecent: jest.fn().mockResolvedValue([
        reward({
          configVersionId: 'daily-v7',
          configVersion: 7,
          taskSnapshot,
        }),
        reward({
          id: 'reward-2',
          source: DailyChallengeRewardSource.STREAK,
          assignmentId: undefined,
          streakDays: 7,
          seasonPoint: 150,
        }),
      ]),
    } as unknown as jest.Mocked<DailyChallengeRewardStore>;
    const service = new DailyChallengeRewardNotificationService(store);

    await expect(service.getRecentRewards(483215844, 20)).resolves.toEqual([
      {
        rewardId: 'reward-1',
        dayId: '2026-08-03',
        source: DailyChallengeRewardSource.PERSONAL,
        seasonPoint: 100,
        createdAt: '2026-08-04T02:00:00.000Z',
        configVersionId: 'daily-v7',
        configVersion: 7,
        assignmentId: 'assignment-1',
        taskSnapshot,
      },
      {
        rewardId: 'reward-2',
        dayId: '2026-08-03',
        source: DailyChallengeRewardSource.STREAK,
        seasonPoint: 150,
        createdAt: '2026-08-04T02:00:00.000Z',
        streakDays: 7,
      },
    ]);
    expect(store.listRecent).toHaveBeenCalledWith(483215844, 20);
  });
});
