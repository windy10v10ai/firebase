import { Injectable, InternalServerErrorException } from '@nestjs/common';

import {
  DailyChallengePersonalStarValues,
  DailyChallengeTaskDefinition,
} from '../types/daily-challenge-config.types';
import {
  ChallengeScope,
  DAILY_CHALLENGE_MATCH_DATA_VERSION,
  DailyChallengePersonalStar,
} from '../types/daily-challenge.types';

export interface GeneratePlayerCandidatesInput {
  dayId: string;
  steamId: number;
  currentRound?: number;
  refreshIndex: number;
  configVersion: number;
  tasks: DailyChallengeTaskDefinition[];
  seenTaskIds: string[];
  recentTaskIds?: string[];
  personalStarWeights?: DailyChallengePersonalStarValues;
}

export type GeneratedDailyChallengeCandidate = DailyChallengeTaskDefinition & {
  star: DailyChallengePersonalStar;
};

@Injectable()
export class DailyChallengeGenerationService {
  generatePlayerCandidates(
    input: GeneratePlayerCandidatesInput,
  ): GeneratedDailyChallengeCandidate[] {
    const enabled = this.filterAvailableTasks(input.tasks, input.dayId);
    const seen = new Set(input.seenTaskIds);
    const recent = new Set(input.recentTaskIds ?? []);
    const seedBase = `${input.dayId}:${input.steamId}:${input.currentRound ?? 1}:${input.refreshIndex}:${input.configVersion}`;

    const general = enabled.filter((task) => task.scope === ChallengeScope.PERSONAL_GENERAL);
    const hero = enabled.filter((task) => task.scope === ChallengeScope.PERSONAL_HERO);

    const firstGeneral = this.pickWithFallback(general, `${seedBase}:general:0`, seen, recent);
    const secondGeneralPool = general.filter(
      (task) => task.id !== firstGeneral.id && task.category !== firstGeneral.category,
    );
    const secondGeneral = this.pickWithFallback(
      secondGeneralPool,
      `${seedBase}:general:1`,
      seen,
      recent,
    );
    const heroTask = this.pickWithFallback(hero, `${seedBase}:hero:0`, seen, recent);

    const starWeights = input.personalStarWeights ?? { 1: 1, 2: 1, 3: 1 };
    return [firstGeneral, secondGeneral, heroTask].map((task, index) => ({
      ...task,
      star: this.pickStar(starWeights, `${seedBase}:star:${index}`),
    }));
  }

  generateGlobalTask(
    dayId: string,
    configVersion: number,
    tasks: DailyChallengeTaskDefinition[],
    recentTaskIds: string[] = [],
  ): DailyChallengeTaskDefinition {
    const recent = new Set(recentTaskIds);
    const pool = this.filterAvailableTasks(tasks, dayId).filter(
      (task) => task.scope === ChallengeScope.GLOBAL,
    );
    return this.pickWithFallback(pool, `${dayId}:${configVersion}:global`, new Set(), recent);
  }

  private filterAvailableTasks(
    tasks: DailyChallengeTaskDefinition[],
    dayId: string,
  ): DailyChallengeTaskDefinition[] {
    return tasks.filter(
      (task) =>
        task.enabled &&
        task.minDataVersion <= DAILY_CHALLENGE_MATCH_DATA_VERSION &&
        (!task.availableFrom || task.availableFrom <= dayId) &&
        (!task.availableUntil || task.availableUntil >= dayId),
    );
  }

  private pickWithFallback(
    pool: DailyChallengeTaskDefinition[],
    seed: string,
    seen: Set<string>,
    recent: Set<string>,
  ): DailyChallengeTaskDefinition {
    // recentTaskIds contains tasks seen in recent challenge days. Only tasks with
    // a positive cooldown remain excluded; cooldownDays = 0 is explicitly reusable.
    const coolingDown = new Set(
      pool.filter((task) => task.cooldownDays > 0 && recent.has(task.id)).map((task) => task.id),
    );
    const preferred = pool.filter((task) => !seen.has(task.id) && !coolingDown.has(task.id));
    const unseen = pool.filter((task) => !seen.has(task.id));
    return this.pickWeighted(
      preferred.length > 0 ? preferred : unseen.length > 0 ? unseen : pool,
      seed,
    );
  }

  private pickWeighted(
    pool: DailyChallengeTaskDefinition[],
    seed: string,
  ): DailyChallengeTaskDefinition {
    if (pool.length === 0) {
      throw new InternalServerErrorException('每日挑战任务池容量不足');
    }

    const sorted = [...pool].sort((left, right) => left.id.localeCompare(right.id));
    const totalWeight = sorted.reduce((total, task) => total + task.weight, 0);
    let cursor = (this.hash(seed) / 0x100000000) * totalWeight;

    for (const task of sorted) {
      cursor -= task.weight;
      if (cursor < 0) {
        return task;
      }
    }
    return sorted[sorted.length - 1];
  }

  private pickStar(
    weights: DailyChallengePersonalStarValues,
    seed: string,
  ): DailyChallengePersonalStar {
    const stars: DailyChallengePersonalStar[] = [1, 2, 3];
    const totalWeight = stars.reduce((total, star) => total + weights[star], 0);
    let cursor = (this.hashIndependentDraw(seed) / 0x100000000) * totalWeight;
    for (const star of stars) {
      cursor -= weights[star];
      if (cursor < 0) {
        return star;
      }
    }
    return 3;
  }

  private hashIndependentDraw(value: string): number {
    let hash = this.hash(value);
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d);
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x846ca68b);
    hash ^= hash >>> 16;
    return hash >>> 0;
  }

  private hash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}
