import { Collection } from 'fireorm';

import { ChallengeMetric, DailyChallengeContributionTier } from '../types/daily-challenge.types';

@Collection('daily_challenge_global_rankings')
export class DailyChallengeGlobalRanking {
  id: string;
  dayId: string;
  steamId: number;
  assignmentId: string;
  metric: ChallengeMetric;
  value: number;
  tier: DailyChallengeContributionTier;
  rewardSeasonPoint: number;
  frozenAt: Date;
}
