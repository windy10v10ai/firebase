import { Collection } from 'fireorm';

import { DailyChallengeTaskSnapshotDto } from '../dto/daily-challenge-task-snapshot.dto';
import { DailyChallengeGlobalRewardTiers } from '../types/daily-challenge-config.types';
import {
  ChallengeDayStatus,
  DAILY_CHALLENGE_SNAPSHOT_VERSION,
} from '../types/daily-challenge.types';

@Collection('daily_challenge_days')
export class DailyChallengeDay {
  id: string;
  schemaVersion: typeof DAILY_CHALLENGE_SNAPSHOT_VERSION;
  dayId: string;
  configVersionId: string;
  configVersion: number;
  globalTask: DailyChallengeTaskSnapshotDto;
  globalRewardTiers: DailyChallengeGlobalRewardTiers;
  startsAt: Date;
  endsAt: Date;
  closesAt: Date;
  status: ChallengeDayStatus;
  freezeStartedAt?: Date;
  frozenAt?: Date;
  globalProgress?: number;
  globalCompleted?: boolean;
  eligibleContributionCount?: number;
  rewardingStartedAt?: Date;
  settledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
