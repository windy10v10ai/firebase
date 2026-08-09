import { Injectable } from '@nestjs/common';

import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';
import { PlayerDailyChallenge } from '../entities/player-daily-challenge.entity';
import { ChallengeDayStatus } from '../types/daily-challenge.types';

import { ChallengeDayClockService } from './challenge-day-clock.service';
import { DailyChallengeGlobalFreezeService } from './daily-challenge-global-freeze.service';
import { DailyChallengeRewardService } from './daily-challenge-reward.service';
import { DailyChallengeSettlementStore } from './daily-challenge-settlement.store';
import { DailyChallengeStreakService } from './daily-challenge-streak.service';

@Injectable()
export class DailyChallengeSettlementService {
  constructor(
    private readonly store: DailyChallengeSettlementStore,
    private readonly freezeService: DailyChallengeGlobalFreezeService,
    private readonly rewardService: DailyChallengeRewardService,
    private readonly streakService: DailyChallengeStreakService,
    private readonly clockService: ChallengeDayClockService,
  ) {}

  async reconcile(now: Date = new Date()): Promise<DailyChallengeDay[]> {
    const days = await this.store.listEndedDays(now);
    const results: DailyChallengeDay[] = [];
    for (const day of days) {
      results.push(await this.settleDay(day, now));
    }
    return results;
  }

  async settleDay(input: DailyChallengeDay, now: Date = new Date()): Promise<DailyChallengeDay> {
    let day = input;
    if (day.status === ChallengeDayStatus.SETTLED) {
      return day;
    }
    if (day.status === ChallengeDayStatus.OPEN) {
      day = await this.store.markClosing(day.dayId, now);
    }
    if (now.getTime() < day.closesAt.getTime()) {
      return day;
    }
    if (day.status === ChallengeDayStatus.CLOSING || day.status === ChallengeDayStatus.OPEN) {
      day = await this.freezeService.freeze(day.dayId, now);
    }
    if (day.status === ChallengeDayStatus.FROZEN) {
      day = await this.store.beginRewarding(day.dayId, now);
    }
    if (day.status !== ChallengeDayStatus.REWARDING) {
      return day;
    }

    const previousDayId = this.clockService.getWindow(new Date(day.startsAt.getTime() - 1)).dayId;
    const states = await this.store.listPlayerStates(day.dayId);
    for (const state of states) {
      const prepared = await this.store.preparePlayerSettlement(
        state.id,
        `${previousDayId}_${state.steamId}`,
        now,
        (current, previous) => this.calculatePlayerSettlement(current, previous, now),
      );
      await this.grantPlayerRewards(day.dayId, prepared, now);
    }

    for await (const rankings of this.store.streamGlobalRankingPages(day.dayId)) {
      for (const ranking of rankings) {
        await this.rewardService.grantGlobal(
          day.dayId,
          ranking.steamId,
          ranking.tier,
          ranking.rewardSeasonPoint,
          day.globalTask,
          day.configVersionId,
          day.configVersion,
          now,
        );
      }
    }

    return this.store.completeDay(day.dayId, now);
  }

  private calculatePlayerSettlement(
    current: PlayerDailyChallenge,
    previous: PlayerDailyChallenge | null,
    now: Date,
  ) {
    const completed = this.isPersonalCompleted(current);
    const streak = this.streakService.settle({
      dayId: current.dayId,
      completed,
      previousDays: previous?.streakDays ?? 0,
      previousCycleId: previous?.streakCycleId,
      milestones: current.streakMilestones,
    });
    return {
      streakDays: streak.storedDays,
      streakCycleId: streak.cycleId,
      ...(streak.milestone
        ? {
            streakRewardDays: streak.milestone.days,
            streakRewardSeasonPoint: streak.milestone.rewardSeasonPoint,
          }
        : {}),
      settlementProcessedAt: now,
      updatedAt: now,
    };
  }

  private async grantPlayerRewards(
    dayId: string,
    state: PlayerDailyChallenge,
    now: Date,
  ): Promise<void> {
    for (const completedTask of state.completedTasks) {
      await this.rewardService.grantPersonal(
        dayId,
        state.steamId,
        completedTask,
        state.configVersionId,
        state.configVersion,
        now,
      );
    }
    if (state.streakCycleId && state.streakRewardDays && state.streakRewardSeasonPoint) {
      await this.rewardService.grantStreak(
        dayId,
        state.steamId,
        state.streakCycleId,
        state.streakRewardDays,
        state.streakRewardSeasonPoint,
        state.configVersionId,
        state.configVersion,
        now,
      );
    }
  }

  private isPersonalCompleted(state: PlayerDailyChallenge): boolean {
    return Boolean(
      state.completedAt &&
      state.completedRoundCount >= state.totalRounds &&
      state.completedTasks.length >= state.totalRounds,
    );
  }
}
