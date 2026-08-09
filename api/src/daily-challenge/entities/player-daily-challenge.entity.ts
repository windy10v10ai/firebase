import { Collection } from 'fireorm';

import {
  DailyChallengePlayerSnapshotDto,
  DailyChallengeRefreshStateDto,
} from '../dto/daily-challenge-player-snapshot.dto';
import { DailyChallengeTaskSnapshotDto } from '../dto/daily-challenge-task-snapshot.dto';
import {
  DailyChallengeGlobalRewardTiers,
  DailyChallengeStreakMilestone,
} from '../types/daily-challenge-config.types';
import { DAILY_CHALLENGE_SNAPSHOT_VERSION } from '../types/daily-challenge.types';

@Collection('player_daily_challenges')
export class PlayerDailyChallenge {
  id: string;
  schemaVersion: typeof DAILY_CHALLENGE_SNAPSHOT_VERSION;
  steamId: number;
  dayId: string;
  configVersionId: string;
  configVersion: number;
  startsAt: Date;
  endsAt: Date;
  globalTask?: DailyChallengeTaskSnapshotDto;
  globalRewardTiers: DailyChallengeGlobalRewardTiers;
  totalRounds: number;
  currentRound: number;
  completedRoundCount: number;
  completedTasks: DailyChallengeTaskSnapshotDto[];
  candidates: DailyChallengeTaskSnapshotDto[];
  seenTaskIds: string[];
  refreshCostsMemberPoint: number[];
  refreshIndex: number;
  freeRefreshUsed: boolean;
  paidRefreshesUsed: number;
  acceptedTask?: DailyChallengeTaskSnapshotDto;
  acceptedAt?: Date;
  progress: number;
  completedAt?: Date;
  unreadRewardCount: number;
  streakDays: number;
  streakCycleId?: string;
  streakRewardDays?: number;
  streakRewardSeasonPoint?: number;
  settlementProcessedAt?: Date;
  streakMilestones: DailyChallengeStreakMilestone[];
  createdAt: Date;
  updatedAt: Date;
}

export type DailyChallengeActionCode = 'accepted' | 'refreshed' | 'viewed';

export interface DailyChallengeActionResult {
  code: DailyChallengeActionCode;
  snapshot: DailyChallengePlayerSnapshotDto;
  costMemberPoint: number;
  memberPointBalance?: number;
}

export interface DailyChallengeAccountState {
  member: {
    id: string;
    steamId: number;
    level: number;
    expireDate: Date;
  } | null;
  player: {
    id: string;
    memberPointTotal: number;
    usedMemberPoint: number;
  };
}

export interface DailyChallengeSnapshotContext {
  state: PlayerDailyChallenge;
  refresh: DailyChallengeRefreshStateDto;
}
