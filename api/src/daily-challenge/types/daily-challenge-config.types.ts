import {
  ChallengeMetric,
  ChallengeScope,
  ChallengeUnit,
  DailyChallengePersonalStar,
} from './daily-challenge.types';

export interface DailyChallengeLocalizedText {
  cn: string;
  en: string;
  ru: string;
}

export interface HeroPureDamageEvidence {
  heroName: string;
  abilityNames: string[];
  verifiedGameRevision: string;
  verifiedAt: string;
  note?: string;
}

export interface DailyChallengeTaskDefinition {
  id: string;
  revision: number;
  enabled: boolean;
  scope: ChallengeScope;
  metric: ChallengeMetric;
  unit: ChallengeUnit;
  category: string;
  title: DailyChallengeLocalizedText;
  description: DailyChallengeLocalizedText;
  target: number;
  starTargets?: Record<DailyChallengePersonalStar, number>;
  rewardSeasonPoint: number;
  weight: number;
  expectedMatches: number;
  cooldownDays: number;
  minDataVersion: number;
  availableFrom?: string;
  availableUntil?: string;
  groupTags: string[];
  mutexTags: string[];
  heroName?: string;
  targetType?: string;
  damageType?: string;
  controlType?: string;
  pureDamageEvidence?: HeroPureDamageEvidence;
}

export interface GlobalChallengeTargetPolicy {
  launchTarget: number;
  minTarget: number;
  maxTarget: number;
  perPlayerExpectedContribution: number;
  completionFactor: number;
  maxDailyChangeRatio: number;
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
  personalRoundsPerDay?: number;
  personalStarRewards?: DailyChallengePersonalStarValues;
  personalStarWeights?: DailyChallengePersonalStarValues;
  personalDefaultStarMultipliers?: DailyChallengePersonalStarValues;
  tasks: DailyChallengeTaskDefinition[];
  globalTargetPolicies: Record<string, GlobalChallengeTargetPolicy>;
  globalRewardTiers: DailyChallengeGlobalRewardTiers;
  refreshCostsMemberPoint: number[];
  streakMilestones: DailyChallengeStreakMilestone[];
}

export type DailyChallengeConfigIssueSeverity = 'error' | 'warning';

export interface DailyChallengeConfigValidationIssue {
  severity: DailyChallengeConfigIssueSeverity;
  code: string;
  message: string;
  taskId?: string;
}
