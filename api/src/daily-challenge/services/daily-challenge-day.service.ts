import { Injectable } from '@nestjs/common';

import { DailyChallengeTaskSnapshotDto } from '../dto/daily-challenge-task-snapshot.dto';
import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';
import { DailyChallengeTaskDefinition } from '../types/daily-challenge-config.types';
import {
  ChallengeDayStatus,
  DAILY_CHALLENGE_SNAPSHOT_VERSION,
} from '../types/daily-challenge.types';

import { ChallengeDayClockService } from './challenge-day-clock.service';
import { DailyChallengeConfigService } from './daily-challenge-config.service';
import { DailyChallengeDayStore } from './daily-challenge-day.store';
import { DailyChallengeGenerationService } from './daily-challenge-generation.service';

@Injectable()
export class DailyChallengeDayService {
  constructor(
    private readonly store: DailyChallengeDayStore,
    private readonly configService: DailyChallengeConfigService,
    private readonly generationService: DailyChallengeGenerationService,
    private readonly clockService: ChallengeDayClockService,
  ) {}

  async getOrCreate(now: Date = new Date()): Promise<DailyChallengeDay> {
    const window = this.clockService.getWindow(now);
    const configVersion = await this.configService.getPublished();
    return this.store.getOrCreate(window.dayId, () => {
      const globalTask = this.generationService.generateGlobalTask(
        window.dayId,
        configVersion.version,
        configVersion.snapshot.tasks,
      );
      return {
        id: window.dayId,
        schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
        dayId: window.dayId,
        configVersionId: configVersion.id,
        configVersion: configVersion.version,
        globalTask: this.createGlobalTaskSnapshot(globalTask, window.dayId, configVersion.version),
        globalRewardTiers: { ...configVersion.snapshot.globalRewardTiers },
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
      revision: task.revision,
      configVersion,
      scope: task.scope,
      metric: task.metric,
      ...(task.heroName ? { heroName: task.heroName } : {}),
      unit: task.unit,
      minDataVersion: task.minDataVersion,
      title: task.title,
      description: task.description,
      target: task.target,
      progress: 0,
      rewardSeasonPoint: task.rewardSeasonPoint,
    };
  }
}
