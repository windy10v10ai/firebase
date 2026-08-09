import { Collection } from 'fireorm';

import { DailyChallengeConfigSnapshot } from '../types/daily-challenge-config.types';

export enum DailyChallengeConfigVersionStatus {
  PUBLISHED = 'published',
  ROLLED_BACK = 'rolled_back',
}

@Collection('daily_challenge_config_versions')
export class DailyChallengeConfigVersion {
  id: string;
  version: number;
  status: DailyChallengeConfigVersionStatus;
  snapshot: DailyChallengeConfigSnapshot;
  createdBy: string;
  createdAt: Date;
  publishedAt: Date;
}

@Collection('daily_challenge_config')
export class DailyChallengeConfigPointer {
  id: 'draft' | 'published';
  versionId?: string;
  draft?: DailyChallengeConfigSnapshot;
  updatedBy: string;
  updatedAt: Date;
}
