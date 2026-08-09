import { Injectable } from '@nestjs/common';

import { DailyChallengeTaskSnapshotDto } from '../dto/daily-challenge-task-snapshot.dto';
import {
  DailyChallengeRewardLedger,
  DailyChallengeRewardNotificationStatus,
} from '../entities/daily-challenge-reward-ledger.entity';
import {
  DailyChallengeContributionTier,
  DailyChallengeRewardSource,
} from '../types/daily-challenge.types';

import { DailyChallengeRewardStore } from './daily-challenge-reward.store';

@Injectable()
export class DailyChallengeRewardService {
  constructor(private readonly store: DailyChallengeRewardStore) {}

  buildPersonalReward(
    dayId: string,
    steamId: number,
    taskSnapshot: DailyChallengeTaskSnapshotDto,
    configVersionId: string,
    configVersion: number,
    now: Date,
    notificationStatus: DailyChallengeRewardNotificationStatus = 'pending',
  ): DailyChallengeRewardLedger {
    return this.validate({
      id: `${dayId}_${steamId}_personal_${taskSnapshot.assignmentId}`,
      dayId,
      steamId,
      source: DailyChallengeRewardSource.PERSONAL,
      assignmentId: taskSnapshot.assignmentId,
      taskSnapshot,
      configVersionId,
      configVersion,
      seasonPoint: taskSnapshot.rewardSeasonPoint,
      notificationStatus,
      ...(notificationStatus === 'notified' ? { notifiedAt: now } : {}),
      createdAt: now,
    });
  }

  grantPersonal(
    dayId: string,
    steamId: number,
    taskSnapshot: DailyChallengeTaskSnapshotDto,
    configVersionId: string,
    configVersion: number,
    now: Date,
    notificationStatus: DailyChallengeRewardNotificationStatus = 'pending',
  ) {
    return this.store.grant(
      this.buildPersonalReward(
        dayId,
        steamId,
        taskSnapshot,
        configVersionId,
        configVersion,
        now,
        notificationStatus,
      ),
    );
  }

  grantGlobal(
    dayId: string,
    steamId: number,
    contributionTier: DailyChallengeContributionTier,
    seasonPoint: number,
    taskSnapshot: DailyChallengeTaskSnapshotDto,
    configVersionId: string,
    configVersion: number,
    now: Date,
  ) {
    return this.grant({
      id: `${dayId}_${steamId}_global`,
      dayId,
      steamId,
      source: DailyChallengeRewardSource.GLOBAL,
      contributionTier,
      taskSnapshot,
      configVersionId,
      configVersion,
      seasonPoint,
      notificationStatus: 'pending',
      createdAt: now,
    });
  }

  grantStreak(
    dayId: string,
    steamId: number,
    streakCycleId: string,
    streakDays: number,
    seasonPoint: number,
    configVersionId: string,
    configVersion: number,
    now: Date,
  ) {
    return this.grant({
      id: `${dayId}_${steamId}_streak_${streakCycleId}_${streakDays}`,
      dayId,
      steamId,
      source: DailyChallengeRewardSource.STREAK,
      streakCycleId,
      streakDays,
      seasonPoint,
      configVersionId,
      configVersion,
      notificationStatus: 'pending',
      createdAt: now,
    });
  }

  private grant(reward: DailyChallengeRewardLedger) {
    return this.store.grant(this.validate(reward));
  }

  private validate(reward: DailyChallengeRewardLedger): DailyChallengeRewardLedger {
    if (!Number.isInteger(reward.seasonPoint) || reward.seasonPoint < 1) {
      throw new Error('Daily challenge reward season point must be a positive integer');
    }
    return reward;
  }
}
