import { Injectable } from '@nestjs/common';

import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';
import { DailyChallengeGlobalContribution } from '../entities/daily-challenge-global-contribution.entity';
import { DailyChallengeGlobalRanking } from '../entities/daily-challenge-global-ranking.entity';
import { ChallengeDayStatus } from '../types/daily-challenge.types';

import { DailyChallengeGlobalFreezeStore } from './daily-challenge-global-freeze.store';
import { DailyChallengeGlobalRankingService } from './daily-challenge-global-ranking.service';

@Injectable()
export class DailyChallengeGlobalFreezeService {
  private readonly rankingBatchSize = 500;

  constructor(
    private readonly store: DailyChallengeGlobalFreezeStore,
    private readonly rankingService: DailyChallengeGlobalRankingService,
  ) {}

  async freeze(dayId: string, now: Date = new Date()): Promise<DailyChallengeDay> {
    const day = await this.store.beginFreeze(dayId, now);
    if (
      day.status === ChallengeDayStatus.FROZEN ||
      day.status === ChallengeDayStatus.REWARDING ||
      day.status === ChallengeDayStatus.SETTLED
    ) {
      return day;
    }

    const summary = await this.summarizeContributions(dayId, day);
    const globalCompleted = summary.globalProgress >= day.globalTask.target;

    if (globalCompleted) {
      await this.freezeRankings(dayId, day, summary.eligibleContributionCount, now);
    }

    return this.store.completeFreeze(dayId, {
      ...summary,
      globalCompleted,
      frozenAt: now,
    });
  }

  private async summarizeContributions(
    dayId: string,
    day: DailyChallengeDay,
  ): Promise<{ globalProgress: number; eligibleContributionCount: number }> {
    let globalProgress = 0;
    let eligibleContributionCount = 0;

    for await (const page of this.store.streamContributionPages(dayId)) {
      for (const contribution of page) {
        if (!this.isEligibleContribution(contribution, day)) {
          continue;
        }
        globalProgress += contribution.value;
        eligibleContributionCount += 1;
      }
    }

    return { globalProgress, eligibleContributionCount };
  }

  private async freezeRankings(
    dayId: string,
    day: DailyChallengeDay,
    eligibleContributionCount: number,
    now: Date,
  ): Promise<void> {
    const cursor = this.rankingService.createCursor(
      eligibleContributionCount,
      day.globalRewardTiers,
    );
    let pending: DailyChallengeGlobalRanking[] = [];

    for await (const page of this.store.streamContributionPages(dayId)) {
      for (const contribution of page) {
        if (!this.isEligibleContribution(contribution, day)) {
          continue;
        }
        const ranking = cursor.rank(contribution);
        pending.push({
          id: `${dayId}_${ranking.steamId}`,
          dayId,
          steamId: ranking.steamId,
          assignmentId: day.globalTask.assignmentId,
          metric: day.globalTask.metric,
          value: ranking.value,
          tier: ranking.tier,
          rewardSeasonPoint: ranking.rewardSeasonPoint,
          frozenAt: now,
        });
        if (pending.length === this.rankingBatchSize) {
          await this.store.writeRankings(pending);
          pending = [];
        }
      }
    }

    if (pending.length > 0) {
      await this.store.writeRankings(pending);
    }
  }

  private isEligibleContribution(
    contribution: DailyChallengeGlobalContribution,
    day: DailyChallengeDay,
  ): boolean {
    return (
      contribution.assignmentId === day.globalTask.assignmentId &&
      contribution.metric === day.globalTask.metric &&
      Number.isFinite(contribution.value) &&
      contribution.value > 0
    );
  }
}
