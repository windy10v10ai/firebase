import { Injectable, InternalServerErrorException } from '@nestjs/common';

import {
  DailyChallengePersonalStarValues,
  DailyChallengeTaskDefinition,
} from '../types/daily-challenge-config.types';
import {
  ChallengeMetric,
  ChallengeScope,
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
    const seen = new Set(input.seenTaskIds);
    const seedBase = `${input.dayId}:${input.steamId}:${input.currentRound ?? 1}:${input.refreshIndex}:${input.configVersion}`;
    const general = input.tasks.filter((task) => task.scope === ChallengeScope.PERSONAL_GENERAL);
    const hero = input.tasks.filter((task) => task.scope === ChallengeScope.PERSONAL_HERO);

    const firstGeneral = this.pickWithFallback(general, `${seedBase}:general:0`, seen);
    const secondGeneralPool = general.filter(
      (task) =>
        task.id !== firstGeneral.id &&
        this.getMetricCategory(task.metric) !== this.getMetricCategory(firstGeneral.metric),
    );
    const secondGeneral = this.pickWithFallback(secondGeneralPool, `${seedBase}:general:1`, seen);
    const heroTask = this.pickWithFallback(hero, `${seedBase}:hero:0`, seen);

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
  ): DailyChallengeTaskDefinition {
    const pool = tasks.filter((task) => task.scope === ChallengeScope.GLOBAL);
    return this.pick(pool, `${dayId}:${configVersion}:global`);
  }

  private pickWithFallback(
    pool: DailyChallengeTaskDefinition[],
    seed: string,
    seen: Set<string>,
  ): DailyChallengeTaskDefinition {
    const unseen = pool.filter((task) => !seen.has(task.id));
    return this.pick(unseen.length > 0 ? unseen : pool, seed);
  }

  private pick(pool: DailyChallengeTaskDefinition[], seed: string): DailyChallengeTaskDefinition {
    if (pool.length === 0) {
      throw new InternalServerErrorException('???????????');
    }
    const sorted = [...pool].sort((left, right) => left.id.localeCompare(right.id));
    return sorted[this.hash(seed) % sorted.length];
  }

  private getMetricCategory(metric: ChallengeMetric): string {
    switch (metric) {
      case ChallengeMetric.HERO_DAMAGE:
      case ChallengeMetric.PHYSICAL_DAMAGE:
      case ChallengeMetric.MAGICAL_DAMAGE:
      case ChallengeMetric.PURE_DAMAGE:
        return 'damage';
      case ChallengeMetric.STUN_DURATION_MS:
      case ChallengeMetric.SLOW_DURATION_MS:
      case ChallengeMetric.ROOT_DURATION_MS:
      case ChallengeMetric.SILENCE_DURATION_MS:
      case ChallengeMetric.TAUNT_DURATION_MS:
      case ChallengeMetric.BREAK_DURATION_MS:
      case ChallengeMetric.DEBUFF_DURATION_MS:
        return 'control';
      default:
        return metric;
    }
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
