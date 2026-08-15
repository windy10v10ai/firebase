import { Collection } from 'fireorm';

import { DailyChallengeTaskSnapshotDto } from '../dto/daily-challenge-task-snapshot.dto';
import { ChallengeMetric } from '../types/daily-challenge.types';

@Collection('daily_challenge_match_ledger')
export class DailyChallengeMatchLedger {
  id: string;
  matchId: string;
  matchStartedAt?: Date;
  steamId: number;
  dayId: string;
  normallySettled: boolean;
  acceptedAssignmentId?: string;
  metric?: ChallengeMetric;
  reportedValue: number;
  appliedPersonalProgress: number;
  personalReward?: {
    taskSnapshot: DailyChallengeTaskSnapshotDto;
    configVersionId: string;
    configVersion: number;
  };
  personalRewardLedgerId?: string;
  globalMetric?: ChallengeMetric;
  reportedGlobalValue: number;
  appliedGlobalContribution: number;
  createdAt: Date;
}
