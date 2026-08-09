import { Collection } from 'fireorm';

import { ChallengeMetric } from '../types/daily-challenge.types';

@Collection('daily_challenge_global_contributions')
export class DailyChallengeGlobalContribution {
  id: string;
  dayId: string;
  steamId: number;
  assignmentId: string;
  metric: ChallengeMetric;
  value: number;
  createdAt: Date;
  updatedAt: Date;
}
