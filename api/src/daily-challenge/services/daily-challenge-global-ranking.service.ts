import { Injectable } from '@nestjs/common';

import { DailyChallengeGlobalRewardTiers } from '../types/daily-challenge-config.types';
import { DailyChallengeContributionTier } from '../types/daily-challenge.types';

export interface DailyChallengeGlobalRankingInput {
  steamId: number;
  value: number;
}

export interface DailyChallengeGlobalRankingResult extends DailyChallengeGlobalRankingInput {
  tier: DailyChallengeContributionTier;
  rewardSeasonPoint: number;
}

export interface DailyChallengeGlobalRankingCursor {
  rank(contribution: DailyChallengeGlobalRankingInput): DailyChallengeGlobalRankingResult;
}

@Injectable()
export class DailyChallengeGlobalRankingService {
  rank(
    contributions: DailyChallengeGlobalRankingInput[],
    rewardTiers: DailyChallengeGlobalRewardTiers,
  ): DailyChallengeGlobalRankingResult[] {
    const eligible = contributions
      .filter(({ value }) => Number.isFinite(value) && value > 0)
      .map(({ steamId, value }) => ({ steamId, value: Math.trunc(value) }))
      .sort((left, right) => right.value - left.value || left.steamId - right.steamId);
    const cursor = this.createCursor(eligible.length, rewardTiers);
    return eligible.map((contribution) => cursor.rank(contribution));
  }

  createCursor(
    eligibleContributionCount: number,
    rewardTiers: DailyChallengeGlobalRewardTiers,
  ): DailyChallengeGlobalRankingCursor {
    const topSeatCount = Math.min(
      eligibleContributionCount,
      Math.max(1, Math.ceil((eligibleContributionCount * rewardTiers.topPercent) / 100)),
    );
    const middleSeatCount = Math.min(
      eligibleContributionCount - topSeatCount,
      Math.ceil((eligibleContributionCount * rewardTiers.middlePercent) / 100),
    );
    const middleBoundaryOrdinal = topSeatCount + middleSeatCount;
    let ordinal = 0;
    let topBoundaryValue: number | undefined;
    let middleBoundaryValue: number | undefined;

    return {
      rank: ({ steamId, value }) => {
        const normalizedValue = Math.trunc(value);
        ordinal += 1;

        if (ordinal <= topSeatCount) {
          if (ordinal === topSeatCount) {
            topBoundaryValue = normalizedValue;
          }
          return {
            steamId,
            value: normalizedValue,
            tier: DailyChallengeContributionTier.TOP,
            rewardSeasonPoint: rewardTiers.topRewardSeasonPoint,
          };
        }
        if (topBoundaryValue !== undefined && normalizedValue >= topBoundaryValue) {
          return {
            steamId,
            value: normalizedValue,
            tier: DailyChallengeContributionTier.TOP,
            rewardSeasonPoint: rewardTiers.topRewardSeasonPoint,
          };
        }
        if (ordinal <= middleBoundaryOrdinal) {
          if (ordinal === middleBoundaryOrdinal) {
            middleBoundaryValue = normalizedValue;
          }
          return {
            steamId,
            value: normalizedValue,
            tier: DailyChallengeContributionTier.MIDDLE,
            rewardSeasonPoint: rewardTiers.middleRewardSeasonPoint,
          };
        }
        if (middleBoundaryValue !== undefined && normalizedValue >= middleBoundaryValue) {
          return {
            steamId,
            value: normalizedValue,
            tier: DailyChallengeContributionTier.MIDDLE,
            rewardSeasonPoint: rewardTiers.middleRewardSeasonPoint,
          };
        }
        return {
          steamId,
          value: normalizedValue,
          tier: DailyChallengeContributionTier.BASE,
          rewardSeasonPoint: rewardTiers.baseRewardSeasonPoint,
        };
      },
    };
  }
}
