import { Collection } from 'fireorm';

import { DailyChallengeTaskSnapshotDto } from '../dto/daily-challenge-task-snapshot.dto';
import {
  DailyChallengeContributionTier,
  DailyChallengeRewardSource,
} from '../types/daily-challenge.types';

export type DailyChallengeRewardNotificationStatus = 'pending' | 'notified' | 'viewed';

@Collection('daily_challenge_reward_ledger')
export class DailyChallengeRewardLedger {
  id: string;
  dayId: string;
  steamId: number;
  source: DailyChallengeRewardSource;
  configVersionId?: string;
  configVersion?: number;
  taskSnapshot?: DailyChallengeTaskSnapshotDto;
  assignmentId?: string;
  contributionTier?: DailyChallengeContributionTier;
  streakCycleId?: string;
  streakDays?: number;
  seasonPoint: number;
  notificationStatus: DailyChallengeRewardNotificationStatus;
  notifiedAt?: Date;
  viewedAt?: Date;
  createdAt: Date;
}
