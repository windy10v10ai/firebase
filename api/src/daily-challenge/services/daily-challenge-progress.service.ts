import { Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';

import { DailyChallengeGameEndRewardDto } from '../dto/daily-challenge-game-end-reward.dto';
import {
  DailyChallengeMatchContributionDto,
  DailyChallengePlayerContributionDto,
} from '../dto/daily-challenge-match-contribution.dto';
import { DailyChallengeTaskSnapshotDto } from '../dto/daily-challenge-task-snapshot.dto';
import { DailyChallengeGlobalContribution } from '../entities/daily-challenge-global-contribution.entity';
import { DailyChallengeMatchLedger } from '../entities/daily-challenge-match-ledger.entity';
import { PlayerDailyChallenge } from '../entities/player-daily-challenge.entity';
import { DailyChallengeConfigSnapshot } from '../types/daily-challenge-config.types';
import {
  ChallengeMetric,
  ChallengeScope,
  DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION,
  DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION,
  DailyChallengeRewardSource,
} from '../types/daily-challenge.types';

import { ChallengeDayClockService } from './challenge-day-clock.service';
import { DailyChallengeConfigService } from './daily-challenge-config.service';
import { DailyChallengeGenerationService } from './daily-challenge-generation.service';
import { resolvePersonalChallengeConfig } from './daily-challenge-personal-config';
import { DailyChallengePlayerService } from './daily-challenge-player.service';
import { DailyChallengeProgressStore } from './daily-challenge-progress.store';
import { DailyChallengeRewardService } from './daily-challenge-reward.service';

export interface DailyChallengeEligiblePlayer {
  steamId: number;
  heroName: string;
}

export interface DailyChallengeGameEndResult {
  ledgers: DailyChallengeMatchLedger[];
  rewards: DailyChallengeGameEndRewardDto[];
}

@Injectable()
export class DailyChallengeProgressService {
  constructor(
    private readonly store: DailyChallengeProgressStore,
    private readonly clock: ChallengeDayClockService,
    private readonly rewardService: DailyChallengeRewardService,
    private readonly configService: DailyChallengeConfigService,
    private readonly generationService: DailyChallengeGenerationService,
    private readonly playerService: DailyChallengePlayerService,
  ) {}

  async applyGameEnd(
    matchId: string,
    contribution: DailyChallengeMatchContributionDto | undefined,
    eligiblePlayers: DailyChallengeEligiblePlayer[],
    now: Date,
  ): Promise<DailyChallengeGameEndResult> {
    if (!contribution) {
      return { ledgers: [], rewards: [] };
    }

    const matchStartedAt = new Date(contribution.matchStartedAt);
    if (
      Number.isNaN(matchStartedAt.getTime()) ||
      this.clock.getWindow(matchStartedAt).dayId !== contribution.dayId
    ) {
      return { ledgers: [], rewards: [] };
    }

    const eligiblePlayerBySteamId = new Map(
      eligiblePlayers.map((player) => [player.steamId, player]),
    );
    const ledgers: DailyChallengeMatchLedger[] = [];
    const rewards: DailyChallengeGameEndRewardDto[] = [];

    for (const playerContribution of contribution.players) {
      const stateId = `${contribution.dayId}_${playerContribution.steamId}`;
      const ledgerId = this.buildMatchLedgerId(
        contribution.dayId,
        matchId,
        matchStartedAt,
        playerContribution.steamId,
      );
      const eligiblePlayer = eligiblePlayerBySteamId.get(playerContribution.steamId);

      const preloadedState = await this.store.getState(stateId);
      const configVersion = preloadedState
        ? await this.configService.getVersion(preloadedState.configVersionId)
        : null;
      const contributionResult = await this.store.runMatchContribution(
        ledgerId,
        stateId,
        stateId,
        (state, globalContribution) => {
          const mutation = this.buildMutation(
            matchId,
            contribution.dayId,
            contribution.dataVersion,
            playerContribution,
            eligiblePlayer,
            state,
            globalContribution,
            configVersion?.snapshot,
            matchStartedAt,
            now,
          );
          const personalReward = mutation.ledger.personalReward;
          return personalReward
            ? {
                ...mutation,
                personalReward: this.rewardService.buildPersonalReward(
                  contribution.dayId,
                  playerContribution.steamId,
                  personalReward.taskSnapshot,
                  personalReward.configVersionId,
                  personalReward.configVersion,
                  now,
                  'notified',
                ),
              }
            : mutation;
        },
      );
      const ledger = contributionResult.ledger;
      ledgers.push(ledger);

      const atomicReward = contributionResult.personalRewardGrant?.reward;
      if (atomicReward) {
        // The reward ledger is created in the same Firestore transaction as the
        // match ledger. Replay the reward in the response even when the ledger
        // already existed, so a lost /game/end response can be safely retried
        // without losing the end-screen display.
        rewards.push(this.toGameEndReward(atomicReward, ledger));
      } else if (
        !contributionResult.ledgerCreated &&
        ledger.personalRewardLedgerId &&
        ledger.personalReward
      ) {
        rewards.push(
          this.toGameEndReward(
            {
              steamId: ledger.steamId,
              source: DailyChallengeRewardSource.PERSONAL,
              seasonPoint: ledger.personalReward.taskSnapshot.rewardSeasonPoint,
              dayId: ledger.dayId,
              assignmentId: ledger.personalReward.taskSnapshot.assignmentId,
            },
            ledger,
          ),
        );
      } else if (
        !contributionResult.ledgerCreated &&
        ledger.personalReward &&
        !ledger.personalRewardLedgerId
      ) {
        try {
          // Narrow compatibility path for ledgers written before the atomic
          // reward marker existed. grantPersonal() remains idempotent.
          const grantResult = await this.rewardService.grantPersonal(
            ledger.dayId,
            ledger.steamId,
            ledger.personalReward.taskSnapshot,
            ledger.personalReward.configVersionId,
            ledger.personalReward.configVersion,
            now,
            'notified',
          );
          rewards.push(this.toGameEndReward(grantResult.reward, ledger));
        } catch (error) {
          logger.warn('daily challenge legacy personal reward compensation unavailable', {
            error,
            matchId,
            steamId: ledger.steamId,
            dayId: ledger.dayId,
            assignmentId: ledger.personalReward.taskSnapshot.assignmentId,
          });
        }
      }
    }

    return { ledgers, rewards };
  }

  private buildMatchLedgerId(
    dayId: string,
    matchId: string,
    matchStartedAt: Date,
    steamId: number,
  ): string {
    return `${dayId}_${matchStartedAt.getTime()}_${encodeURIComponent(matchId)}_${steamId}`;
  }

  private toGameEndReward(
    reward: {
      steamId: number;
      source: DailyChallengeGameEndRewardDto['source'];
      seasonPoint: number;
      dayId: string;
      assignmentId?: string;
    },
    ledger: DailyChallengeMatchLedger,
  ): DailyChallengeGameEndRewardDto {
    return {
      steamId: reward.steamId,
      source: reward.source,
      seasonPoint: reward.seasonPoint,
      dayId: reward.dayId,
      assignmentId: reward.assignmentId ?? ledger.personalReward?.taskSnapshot.assignmentId,
    };
  }

  private findUniqueMetricContribution(
    contributions: DailyChallengePlayerContributionDto['personalMetrics'],
    metric: ChallengeMetric,
  ) {
    const matches = contributions.filter((contribution) => contribution.metric === metric);
    return matches.length === 1 ? matches[0] : undefined;
  }

  private isReasonableContribution(metric: ChallengeMetric, value: number): boolean {
    const maximum = DAILY_CHALLENGE_METRIC_MAX_MATCH_CONTRIBUTION[metric];
    return maximum !== undefined && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
  }

  private getRequiredDataVersion(task: {
    metric: ChallengeMetric;
    minDataVersion?: number;
  }): number {
    return Math.max(
      task.minDataVersion ?? 1,
      DAILY_CHALLENGE_METRIC_MIN_DATA_VERSION[task.metric] ?? 1,
    );
  }

  private buildMutation(
    matchId: string,
    dayId: string,
    dataVersion: number,
    contribution: DailyChallengePlayerContributionDto,
    eligiblePlayer: DailyChallengeEligiblePlayer | undefined,
    state: PlayerDailyChallenge | null,
    globalContribution: DailyChallengeGlobalContribution | null,
    config: DailyChallengeConfigSnapshot | undefined,
    matchStartedAt: Date,
    now: Date,
  ) {
    const task = state?.acceptedTask;
    const metricContribution = task
      ? this.findUniqueMetricContribution(contribution.personalMetrics, task.metric)
      : undefined;
    const reportedValue = metricContribution?.value ?? 0;
    const personalContributionIsReasonable =
      task !== undefined &&
      metricContribution !== undefined &&
      this.isReasonableContribution(task.metric, reportedValue);
    const personalRequiredDataVersion = task ? this.getRequiredDataVersion(task) : 1;
    const acceptedWithinMatchWindow = Boolean(
      state?.acceptedAt && state.acceptedAt.getTime() <= matchStartedAt.getTime() + 10 * 60 * 1000,
    );
    const canApply =
      contribution.normallySettled &&
      acceptedWithinMatchWindow &&
      dataVersion >= personalRequiredDataVersion &&
      eligiblePlayer !== undefined &&
      state !== null &&
      task !== undefined &&
      contribution.acceptedAssignmentId === task.assignmentId &&
      personalContributionIsReasonable &&
      (task.scope !== ChallengeScope.PERSONAL_HERO || task.heroName === eligiblePlayer.heroName);

    const globalTask = state?.globalTask;
    const globalMetricContribution = globalTask
      ? this.findUniqueMetricContribution(contribution.globalMetrics, globalTask.metric)
      : undefined;
    const reportedGlobalValue = globalMetricContribution?.value ?? 0;
    const globalContributionIsReasonable =
      globalTask !== undefined &&
      globalMetricContribution !== undefined &&
      this.isReasonableContribution(globalTask.metric, reportedGlobalValue);
    const globalRequiredDataVersion = globalTask ? this.getRequiredDataVersion(globalTask) : 1;
    const canApplyGlobal =
      contribution.normallySettled &&
      eligiblePlayer !== undefined &&
      globalTask !== undefined &&
      dataVersion >= globalRequiredDataVersion &&
      globalContributionIsReasonable &&
      (globalContribution === null || globalContribution.assignmentId === globalTask.assignmentId);

    let nextState: PlayerDailyChallenge | undefined;
    let nextGlobalContribution: DailyChallengeGlobalContribution | undefined;
    let appliedPersonalProgress = 0;
    let appliedGlobalContribution = 0;
    let completedPersonalTaskNow: DailyChallengeTaskSnapshotDto | undefined;

    if (canApply) {
      const nextProgress = Math.min(task.target, state.progress + reportedValue);
      appliedPersonalProgress = nextProgress - state.progress;
      const progressedTask: DailyChallengeTaskSnapshotDto = {
        ...task,
        progress: nextProgress,
      };
      nextState = {
        ...state,
        progress: nextProgress,
        acceptedTask: progressedTask,
        updatedAt: now,
      };
      if (!state.completedAt && nextProgress >= task.target) {
        completedPersonalTaskNow = progressedTask;
        nextState = this.advanceCompletedRound(state, progressedTask, config, now);
      }
    }

    if (canApplyGlobal) {
      appliedGlobalContribution = reportedGlobalValue;
      nextGlobalContribution = {
        id: `${dayId}_${contribution.steamId}`,
        dayId,
        steamId: contribution.steamId,
        assignmentId: globalTask.assignmentId,
        metric: globalTask.metric,
        value: (globalContribution?.value ?? 0) + reportedGlobalValue,
        createdAt: globalContribution?.createdAt ?? now,
        updatedAt: now,
      };
    }

    return {
      ...(nextState ? { state: nextState } : {}),
      ...(nextGlobalContribution ? { globalContribution: nextGlobalContribution } : {}),
      ledger: {
        matchId,
        matchStartedAt,
        steamId: contribution.steamId,
        dayId,
        normallySettled: contribution.normallySettled,
        ...(contribution.acceptedAssignmentId
          ? { acceptedAssignmentId: contribution.acceptedAssignmentId }
          : {}),
        ...(task ? { metric: task.metric } : {}),
        reportedValue,
        appliedPersonalProgress,
        ...(completedPersonalTaskNow
          ? {
              personalReward: {
                taskSnapshot: completedPersonalTaskNow,
                configVersionId: state.configVersionId,
                configVersion: state.configVersion,
              },
            }
          : {}),
        ...(globalTask ? { globalMetric: globalTask.metric } : {}),
        reportedGlobalValue,
        appliedGlobalContribution,
        createdAt: now,
      },
    };
  }

  private advanceCompletedRound(
    state: PlayerDailyChallenge,
    completedTask: DailyChallengeTaskSnapshotDto,
    config: DailyChallengeConfigSnapshot | undefined,
    now: Date,
  ): PlayerDailyChallenge {
    const completedRoundCount = state.completedRoundCount + 1;
    const completedTasks = [...state.completedTasks, completedTask];
    const baseState: PlayerDailyChallenge = {
      ...state,
      completedRoundCount,
      completedTasks,
      acceptedTask: undefined,
      acceptedAt: undefined,
      progress: 0,
      updatedAt: now,
    };

    if (completedRoundCount >= state.totalRounds) {
      return {
        ...baseState,
        candidates: [],
        currentRound: state.totalRounds,
        completedAt: now,
      };
    }

    if (!config) {
      throw new Error(`Daily challenge config ${state.configVersionId} is unavailable`);
    }
    if (config.version !== state.configVersion) {
      throw new Error(`Daily challenge config version mismatch for ${state.id}`);
    }

    const personalConfig = resolvePersonalChallengeConfig(config);
    const currentRound = state.currentRound + 1;
    const tasks = this.generationService.generatePlayerCandidates({
      dayId: state.dayId,
      steamId: state.steamId,
      currentRound,
      refreshIndex: state.refreshIndex,
      configVersion: state.configVersion,
      tasks: config.tasks,
      seenTaskIds: state.seenTaskIds,
      personalStarWeights: personalConfig.starWeights,
    });
    const candidates = this.playerService.createTaskSnapshots(
      tasks,
      state.dayId,
      state.steamId,
      currentRound,
      state.totalRounds,
      state.refreshIndex,
      state.configVersion,
      personalConfig,
    );
    return {
      ...baseState,
      completedAt: undefined,
      currentRound,
      candidates,
      seenTaskIds: [
        ...new Set([...state.seenTaskIds, ...candidates.map((candidate) => candidate.taskId)]),
      ],
    };
  }
}
