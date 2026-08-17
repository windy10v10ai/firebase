import { Injectable } from '@nestjs/common';

import {
  DAILY_TASKS,
  SMALL_TARGET_THRESHOLD,
  STAR_REWARDS,
  STAR_TARGET_MULTIPLIERS,
  TaskDefinition,
} from '../config/tasks';
import { TaskCandidateDto } from '../dto/daily-task-snapshot.dto';
import { CompletedTask } from '../entities/player-daily-task.entity';
import { TaskScope } from '../types/daily-task.types';

const STARS = [1, 2, 3] as const;

@Injectable()
export class DailyTaskGenerationService {
  private readonly taskById = new Map(DAILY_TASKS.map((task) => [task.id, task]));

  private readonly generalTasks = DAILY_TASKS.filter(
    (task) => task.scope === TaskScope.PERSONAL_GENERAL,
  ).sort((left, right) => left.id.localeCompare(right.id));

  private readonly heroTasks = DAILY_TASKS.filter(
    (task) => task.scope === TaskScope.PERSONAL_HERO,
  ).sort((left, right) => left.id.localeCompare(right.id));

  generateCandidates(
    dayId: string,
    steamId: number,
    round: number,
    completedTaskIds: string[],
  ): TaskCandidateDto[] {
    const seed = `${dayId}:${steamId}:${round}`;
    const completed = new Set(completedTaskIds);
    const generalPool = this.generalTasks.filter((task) => !completed.has(task.id));
    const heroPool = this.heroTasks.filter((task) => !completed.has(task.id));

    const general = this.pick(generalPool, seed, 'general');
    const hero = this.pick(heroPool, seed, 'hero');
    const useGeneralForThird = this.hash(`${seed}:third-scope`) % 2 === 0;

    const third = useGeneralForThird
      ? this.pick(
          generalPool.filter((task) => task.id !== general.id),
          seed,
          'third-general',
        )
      : this.pick(
          heroPool.filter((task) => task.heroName !== hero.heroName),
          seed,
          'third-hero',
        );

    const stars = this.shuffleStars(seed);
    return [general, hero, third].map((task, index) => this.toCandidate(task, stars[index]));
  }

  getTarget(task: TaskDefinition, star: 1 | 2 | 3): number {
    const scaled =
      task.target < SMALL_TARGET_THRESHOLD
        ? task.target + (star - 1)
        : task.target * STAR_TARGET_MULTIPLIERS[star];
    return Math.max(1, Math.round(scaled));
  }

  resolveCompletedTask(task: CompletedTask): TaskCandidateDto | undefined {
    const definition = this.taskById.get(task.taskId);
    if (!definition || !STARS.includes(task.star as 1 | 2 | 3)) {
      return undefined;
    }
    return this.toCandidate(definition, task.star as 1 | 2 | 3);
  }

  private toCandidate(task: TaskDefinition, star: 1 | 2 | 3): TaskCandidateDto {
    return {
      taskId: task.id,
      scope: task.scope,
      metric: task.metric,
      ...(task.heroName ? { heroName: task.heroName } : {}),
      star,
      target: this.getTarget(task, star),
      rewardSeasonPoint: STAR_REWARDS[star],
    };
  }

  private pick(tasks: TaskDefinition[], seed: string, salt: string): TaskDefinition {
    if (tasks.length === 0) {
      throw new Error(`Daily task pool is empty for ${salt}`);
    }
    return tasks[this.hash(`${seed}:${salt}`) % tasks.length];
  }

  private shuffleStars(seed: string): (1 | 2 | 3)[] {
    const stars: (1 | 2 | 3)[] = [...STARS];
    for (let index = stars.length - 1; index > 0; index--) {
      const swapIndex = this.hash(`${seed}:star:${index}`) % (index + 1);
      [stars[index], stars[swapIndex]] = [stars[swapIndex], stars[index]];
    }
    return stars;
  }

  private hash(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}
