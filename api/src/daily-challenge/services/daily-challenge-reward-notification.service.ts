import { Injectable } from '@nestjs/common';

import { PointInfoDto } from '../../game/dto/point-info.dto';
import { DailyChallengeRewardHistoryDto } from '../dto/daily-challenge-reward-history.dto';
import { DailyChallengeRewardLedger } from '../entities/daily-challenge-reward-ledger.entity';
import { DailyChallengeRewardSource } from '../types/daily-challenge.types';

import { DailyChallengeRewardStore } from './daily-challenge-reward.store';

@Injectable()
export class DailyChallengeRewardNotificationService {
  constructor(private readonly store: DailyChallengeRewardStore) {}

  async claimPointInfo(steamIds: number[], now: Date = new Date()): Promise<PointInfoDto[]> {
    const rewards = await this.store.claimPending(steamIds, now);
    return rewards.map((reward) => this.toPointInfo(reward));
  }

  getUnreadCount(steamId: number): Promise<number> {
    return this.store.countUnread(steamId);
  }

  async getRecentRewards(
    steamId: number,
    limit: number = 20,
  ): Promise<DailyChallengeRewardHistoryDto[]> {
    const rewards = await this.store.listRecent(steamId, limit);
    return rewards.map((reward) => this.toHistory(reward));
  }

  markViewed(steamId: number, now: Date = new Date()): Promise<number> {
    return this.store.markViewed(steamId, now);
  }

  private toHistory(reward: DailyChallengeRewardLedger): DailyChallengeRewardHistoryDto {
    return {
      rewardId: reward.id,
      dayId: reward.dayId,
      source: reward.source,
      seasonPoint: reward.seasonPoint,
      createdAt: reward.createdAt.toISOString(),
      ...(reward.configVersionId ? { configVersionId: reward.configVersionId } : {}),
      ...(reward.configVersion ? { configVersion: reward.configVersion } : {}),
      ...(reward.assignmentId ? { assignmentId: reward.assignmentId } : {}),
      ...(reward.contributionTier ? { contributionTier: reward.contributionTier } : {}),
      ...(reward.streakDays ? { streakDays: reward.streakDays } : {}),
      ...(reward.taskSnapshot ? { taskSnapshot: reward.taskSnapshot } : {}),
    };
  }

  private toPointInfo(reward: DailyChallengeRewardLedger): PointInfoDto {
    return {
      steamId: reward.steamId,
      title: this.getTitle(reward.source),
      seasonPoint: reward.seasonPoint,
      dailyChallengeReward: {
        dayId: reward.dayId,
        source: reward.source,
        ...(reward.configVersionId ? { configVersionId: reward.configVersionId } : {}),
        ...(reward.configVersion ? { configVersion: reward.configVersion } : {}),
        ...(reward.assignmentId ? { assignmentId: reward.assignmentId } : {}),
        ...(reward.contributionTier ? { contributionTier: reward.contributionTier } : {}),
        ...(reward.streakDays ? { streakDays: reward.streakDays } : {}),
        ...(reward.taskSnapshot ? { taskSnapshot: reward.taskSnapshot } : {}),
      },
    };
  }

  private getTitle(source: DailyChallengeRewardSource): { cn: string; en: string } {
    switch (source) {
      case DailyChallengeRewardSource.GLOBAL:
        return { cn: '全服共同挑战奖励', en: 'Global Challenge Reward' };
      case DailyChallengeRewardSource.STREAK:
        return { cn: '每日挑战连续完成奖励', en: 'Daily Challenge Streak Reward' };
      default:
        return { cn: '每日挑战完成奖励', en: 'Daily Challenge Reward' };
    }
  }
}
