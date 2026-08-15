import {
  ChallengeMetric,
  ChallengeScope,
  DailyChallengePersonalStar,
} from './daily-challenge.types';

export interface DailyChallengeTaskDefinition {
  id: string;
  scope: ChallengeScope;
  metric: ChallengeMetric;
  target: number;
  starTargets?: Record<DailyChallengePersonalStar, number>;
  heroName?: string;
}

export interface DailyChallengeGlobalRewardTiers {
  topPercent: number;
  middlePercent: number;
  topRewardSeasonPoint: number;
  middleRewardSeasonPoint: number;
  baseRewardSeasonPoint: number;
}

export interface DailyChallengeStreakMilestone {
  days: number;
  rewardSeasonPoint: number;
}

export type DailyChallengePersonalStarValues = Record<DailyChallengePersonalStar, number>;

export interface DailyChallengeConfigSnapshot {
  id: string;
  version: number;
  personalRoundsPerDay: number;
  personalStarRewards: DailyChallengePersonalStarValues;
  personalStarWeights: DailyChallengePersonalStarValues;
  personalDefaultStarMultipliers: DailyChallengePersonalStarValues;
  tasks: DailyChallengeTaskDefinition[];
  globalRewardTiers: DailyChallengeGlobalRewardTiers;
  refreshCostsMemberPoint: number[];
  streakMilestones: DailyChallengeStreakMilestone[];
}
