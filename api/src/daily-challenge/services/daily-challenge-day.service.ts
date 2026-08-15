import { Injectable } from '@nestjs/common';

import { ChallengeDayClockService } from '../../util/challenge-day-clock.service';
import { DAILY_CHALLENGE_CONFIG } from '../config/tasks';
import { DailyChallengeTaskSnapshotDto } from '../dto/daily-challenge-task-snapshot.dto';
import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';
import { DailyChallengeTaskDefinition } from '../types/daily-challenge-config.types';
import {
  ChallengeDayStatus,
  DAILY_CHALLENGE_METRIC_UNIT,
  DAILY_CHALLENGE_SNAPSHOT_VERSION,
} from '../types/daily-challenge.types';

import { DailyChallengeDayStore } from './daily-challenge-day.store';
import { DailyChallengeGenerationService } from './daily-challenge-generation.service';

@Injectable()
export class DailyChallengeDayService {
  constructor(
    private readonly store: DailyChallengeDayStore,
    private readonly generationService: DailyChallengeGenerationService,
    private readonly clockService: ChallengeDayClockService,
  ) {}

  async getOrCreate(now: Date = new Date()): Promise<DailyChallengeDay> {
    const window = this.clockService.getWindow(now);
    return this.store.getOrCreate(window.dayId, () => {
      const globalTask = this.generationService.generateGlobalTask(
        window.dayId,
        DAILY_CHALLENGE_CONFIG.version,
        DAILY_CHALLENGE_CONFIG.tasks,
      );
      return {
        id: window.dayId,
        schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
        dayId: window.dayId,
        configVersionId: DAILY_CHALLENGE_CONFIG.id,
        configVersion: DAILY_CHALLENGE_CONFIG.version,
        globalTask: this.createGlobalTaskSnapshot(
          globalTask,
          window.dayId,
          DAILY_CHALLENGE_CONFIG.version,
        ),
        globalRewardTiers: { ...DAILY_CHALLENGE_CONFIG.globalRewardTiers },
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        closesAt: window.closesAt,
        status: ChallengeDayStatus.OPEN,
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  private createGlobalTaskSnapshot(
    task: DailyChallengeTaskDefinition,
    dayId: string,
    configVersion: number,
  ): DailyChallengeTaskSnapshotDto {
    return {
      assignmentId: `${dayId}-global-${task.id}`,
      taskId: task.id,
      configVersion,
      scope: task.scope,
      metric: task.metric,
      ...(task.heroName ? { heroName: task.heroName } : {}),
      unit: DAILY_CHALLENGE_METRIC_UNIT[task.metric],
      target: task.target,
      progress: 0,
      rewardSeasonPoint: 0,
    };
  }
}
