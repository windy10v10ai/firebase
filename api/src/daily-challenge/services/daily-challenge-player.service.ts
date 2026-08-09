import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';

import { ChallengeDayClockService } from '../../util/challenge-day-clock.service';
import { DAILY_CHALLENGE_CONFIG } from '../config/tasks';
import { AcceptDailyChallengeDto } from '../dto/accept-daily-challenge.dto';
import { DailyChallengePlayerSnapshotDto } from '../dto/daily-challenge-player-snapshot.dto';
import { DailyChallengeRewardHistoryDto } from '../dto/daily-challenge-reward-history.dto';
import { DailyChallengeTaskSnapshotDto } from '../dto/daily-challenge-task-snapshot.dto';
import { ViewDailyChallengeDto } from '../dto/view-daily-challenge.dto';
import {
  DailyChallengeAccountState,
  DailyChallengeActionResult,
  PlayerDailyChallenge,
} from '../entities/player-daily-challenge.entity';
import {
  ChallengeDayStatus,
  DAILY_CHALLENGE_METRIC_UNIT,
  DAILY_CHALLENGE_SNAPSHOT_VERSION,
} from '../types/daily-challenge.types';

import { dailyChallengeConflict } from './daily-challenge-action.error';
import { DailyChallengeDayService } from './daily-challenge-day.service';
import {
  DailyChallengeGenerationService,
  GeneratedDailyChallengeCandidate,
} from './daily-challenge-generation.service';
import { DailyChallengeGlobalProgressStore } from './daily-challenge-global-progress.store';
import {
  ResolvedPersonalChallengeConfig,
  resolvePersonalChallengeConfig,
  resolvePersonalTaskTarget,
} from './daily-challenge-personal-config';
import { DailyChallengePlayerStore } from './daily-challenge-player.store';
import { DailyChallengeRewardNotificationService } from './daily-challenge-reward-notification.service';

@Injectable()
export class DailyChallengePlayerService {
  constructor(
    private readonly store: DailyChallengePlayerStore,
    private readonly dayService: DailyChallengeDayService,
    private readonly generationService: DailyChallengeGenerationService,
    private readonly clockService: ChallengeDayClockService,
    private readonly rewardNotificationService: DailyChallengeRewardNotificationService,
    private readonly globalProgressStore: DailyChallengeGlobalProgressStore,
  ) {}

  async getSnapshots(steamIds: number[], now: Date = new Date()) {
    const globalProgressCache = new Map<string, Promise<number>>();
    const results = await Promise.allSettled(
      steamIds.map((steamId) => this.getSnapshot(steamId, now, globalProgressCache)),
    );
    return results.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return [result.value];
      }
      logger.warn('daily challenge snapshot failed', {
        steamId: steamIds[index],
        error: result.reason,
      });
      return [];
    });
  }

  async getSnapshot(
    steamId: number,
    now: Date = new Date(),
    globalProgressCache?: Map<string, Promise<number>>,
  ): Promise<DailyChallengePlayerSnapshotDto> {
    const state = await this.ensureState(steamId, now);
    const [account, unreadRewardCount, recentRewards, globalProgress] = await Promise.all([
      this.store.getAccountState(steamId),
      this.rewardNotificationService.getUnreadCount(steamId),
      this.rewardNotificationService.getRecentRewards(steamId),
      this.resolveGlobalProgress(state, globalProgressCache),
    ]);
    return this.buildSnapshot(
      state,
      account,
      now,
      unreadRewardCount,
      recentRewards,
      globalProgress,
    );
  }

  async accept(
    steamId: number,
    dto: AcceptDailyChallengeDto,
    now: Date = new Date(),
  ): Promise<DailyChallengeActionResult> {
    this.assertCurrentDay(dto.dayId, now);
    const state = await this.ensureState(steamId, now);
    const operationId = `accept:${dto.dayId}:${steamId}:${dto.requestId}`;
    const operation = await this.store.runOperation(operationId, state.id, steamId, (context) => {
      if (!context.state) {
        throw dailyChallengeConflict('day_closed', '今日挑战状态不存在');
      }
      if (
        context.state.completedAt ||
        context.state.completedRoundCount >= context.state.totalRounds
      ) {
        throw dailyChallengeConflict('day_closed', '今日个人挑战已全部完成');
      }
      if (context.state.acceptedTask) {
        throw dailyChallengeConflict('already_selected', '今日个人挑战已经选择');
      }
      const selected = context.state.candidates.find(
        (candidate) => candidate.assignmentId === dto.assignmentId,
      );
      if (!selected) {
        throw dailyChallengeConflict('invalid_candidate', '该任务不在当前候选中');
      }
      const nextState: PlayerDailyChallenge = {
        ...context.state,
        acceptedTask: selected,
        acceptedAt: now,
        updatedAt: now,
      };
      const result: DailyChallengeActionResult = {
        code: 'accepted',
        snapshot: this.buildSnapshot(nextState, context, now),
        costMemberPoint: 0,
      };
      return {
        state: nextState,
        operation: {
          type: 'accept',
          steamId,
          dayId: dto.dayId,
          requestId: dto.requestId,
          result,
          createdAt: now,
        },
      };
    });
    return { ...operation.result, snapshot: await this.getSnapshot(steamId, now) };
  }

  async markViewed(
    steamId: number,
    dto: ViewDailyChallengeDto,
    now: Date = new Date(),
  ): Promise<DailyChallengeActionResult> {
    this.assertCurrentDay(dto.dayId, now);
    const state = await this.ensureState(steamId, now);
    const operationId = `view:${dto.dayId}:${steamId}:${dto.requestId}`;
    const operation = await this.store.runOperation(operationId, state.id, steamId, (context) => {
      if (!context.state) {
        throw dailyChallengeConflict('day_closed', '今日挑战状态不存在');
      }
      const nextState: PlayerDailyChallenge = {
        ...context.state,
        unreadRewardCount: 0,
        updatedAt: now,
      };
      const result: DailyChallengeActionResult = {
        code: 'viewed',
        snapshot: this.buildSnapshot(nextState, context, now),
        costMemberPoint: 0,
      };
      return {
        state: nextState,
        operation: {
          type: 'view',
          steamId,
          dayId: dto.dayId,
          requestId: dto.requestId,
          result,
          createdAt: now,
        },
      };
    });
    await this.rewardNotificationService.markViewed(steamId, now);
    return { ...operation.result, snapshot: await this.getSnapshot(steamId, now) };
  }

  buildSnapshot(
    state: PlayerDailyChallenge,
    account: DailyChallengeAccountState,
    now: Date = new Date(),
    unreadRewardCount: number = state.unreadRewardCount,
    recentRewards: DailyChallengeRewardHistoryDto[] = [],
    globalProgress: number | undefined = state.globalTask?.progress,
  ): DailyChallengePlayerSnapshotDto {
    const isMember = this.isMemberActive(account.member, now);
    const freeRefreshAvailable =
      isMember && !state.completedAt && !state.acceptedTask && !state.freeRefreshUsed;
    const paidRefreshesRemaining = Math.max(
      0,
      state.refreshCostsMemberPoint.length - state.paidRefreshesUsed,
    );
    const nextCostMemberPoint = freeRefreshAvailable
      ? 0
      : (state.refreshCostsMemberPoint[state.paidRefreshesUsed] ?? 0);
    return {
      schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
      steamId: state.steamId,
      dayId: state.dayId,
      status: ChallengeDayStatus.OPEN,
      startsAt: state.startsAt.toISOString(),
      endsAt: state.endsAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
      totalRounds: state.totalRounds,
      currentRound: state.currentRound,
      completedRoundCount: state.completedRoundCount,
      completedTasks: state.completedTasks,
      globalTask: state.globalTask
        ? { ...state.globalTask, progress: globalProgress ?? state.globalTask.progress ?? 0 }
        : undefined,
      globalRewardTiers: { ...state.globalRewardTiers },
      candidates: state.candidates,
      acceptedTask: state.acceptedTask,
      unreadRewardCount,
      recentRewards,
      needsSelection:
        !state.completedAt && !state.acceptedTask && state.completedRoundCount < state.totalRounds,
      streak: this.buildStreakState(state),
      refresh: {
        isMember,
        freeRefreshAvailable,
        paidRefreshesUsed: state.paidRefreshesUsed,
        paidRefreshesRemaining,
        nextCostMemberPoint,
      },
    };
  }

  private async resolveGlobalProgress(
    state: PlayerDailyChallenge,
    cache?: Map<string, Promise<number>>,
  ): Promise<number | undefined> {
    const task = state.globalTask;
    if (!task) {
      return undefined;
    }

    const key = `${state.dayId}:${task.assignmentId}:${task.metric}`;
    let request = cache?.get(key);
    if (!request) {
      request = this.globalProgressStore
        .getCurrentProgress({
          dayId: state.dayId,
          assignmentId: task.assignmentId,
          metric: task.metric,
        })
        .catch((error) => {
          logger.warn('daily challenge global progress aggregation failed', {
            dayId: state.dayId,
            assignmentId: task.assignmentId,
            error,
          });
          return task.progress ?? 0;
        });
      cache?.set(key, request);
    }
    return request;
  }

  createTaskSnapshots(
    tasks: GeneratedDailyChallengeCandidate[],
    dayId: string,
    steamId: number,
    currentRound: number,
    totalRounds: number,
    refreshIndex: number,
    configVersion: number,
    personalConfig: ResolvedPersonalChallengeConfig,
  ): DailyChallengeTaskSnapshotDto[] {
    return tasks.map((task) => ({
      assignmentId: `${dayId}-${steamId}-round-${currentRound}-refresh-${refreshIndex}-${task.id}`,
      taskId: task.id,
      configVersion,
      scope: task.scope,
      metric: task.metric,
      ...(task.heroName ? { heroName: task.heroName } : {}),
      unit: DAILY_CHALLENGE_METRIC_UNIT[task.metric],
      star: task.star,
      round: currentRound,
      totalRounds,
      target: resolvePersonalTaskTarget(task, task.star, personalConfig.defaultStarMultipliers),
      progress: 0,
      rewardSeasonPoint: personalConfig.starRewards[task.star],
    }));
  }

  private async ensureState(steamId: number, now: Date): Promise<PlayerDailyChallenge> {
    const day = await this.dayService.getOrCreate(now);
    const id = this.createStateId(day.dayId, steamId);
    return this.store.getOrCreateState(id, () => {
      const personalConfig = resolvePersonalChallengeConfig(DAILY_CHALLENGE_CONFIG);
      const currentRound = 1;
      const candidates = this.generationService.generatePlayerCandidates({
        dayId: day.dayId,
        steamId,
        currentRound,
        refreshIndex: 0,
        configVersion: day.configVersion,
        tasks: DAILY_CHALLENGE_CONFIG.tasks,
        seenTaskIds: [],
        personalStarWeights: personalConfig.starWeights,
      });
      const candidateSnapshots = this.createTaskSnapshots(
        candidates,
        day.dayId,
        steamId,
        currentRound,
        personalConfig.roundsPerDay,
        0,
        day.configVersion,
        personalConfig,
      );
      return {
        id,
        schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
        steamId,
        dayId: day.dayId,
        configVersionId: day.configVersionId,
        configVersion: day.configVersion,
        startsAt: day.startsAt,
        endsAt: day.endsAt,
        globalTask: day.globalTask,
        globalRewardTiers: { ...day.globalRewardTiers },
        totalRounds: personalConfig.roundsPerDay,
        currentRound,
        completedRoundCount: 0,
        completedTasks: [],
        candidates: candidateSnapshots,
        seenTaskIds: candidateSnapshots.map((candidate) => candidate.taskId),
        refreshCostsMemberPoint: [...DAILY_CHALLENGE_CONFIG.refreshCostsMemberPoint],
        refreshIndex: 0,
        freeRefreshUsed: false,
        paidRefreshesUsed: 0,
        progress: 0,
        unreadRewardCount: 0,
        streakDays: 0,
        streakMilestones: DAILY_CHALLENGE_CONFIG.streakMilestones.map((milestone) => ({
          ...milestone,
        })),
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  private buildStreakState(state: PlayerDailyChallenge) {
    const milestones = [...state.streakMilestones].sort((left, right) => left.days - right.days);
    const firstMilestone = milestones[0];
    if (!firstMilestone) {
      throw new Error('Daily challenge streak milestones are missing');
    }
    const cycleTargetDays = milestones[milestones.length - 1]?.days ?? firstMilestone.days;
    const nextMilestone =
      milestones.find((milestone) => milestone.days > state.streakDays) ?? firstMilestone;
    return {
      currentDays: state.streakDays,
      cycleTargetDays,
      nextMilestoneDays: nextMilestone.days,
      nextMilestoneRewardSeasonPoint: nextMilestone.rewardSeasonPoint,
    };
  }

  private createStateId(dayId: string, steamId: number): string {
    return `${dayId}_${steamId}`;
  }

  private assertCurrentDay(dayId: string, now: Date): void {
    if (this.clockService.getWindow(now).dayId !== dayId) {
      throw dailyChallengeConflict('day_closed', '该挑战日已经结束');
    }
  }

  private isMemberActive(member: DailyChallengeAccountState['member'], now: Date): boolean {
    if (!member) {
      return false;
    }
    const oneDayAgo = new Date(now);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    return member.expireDate > oneDayAgo;
  }
}
