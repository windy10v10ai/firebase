import {
  DailyChallengeConfigSnapshot,
  DailyChallengePersonalStarValues,
  DailyChallengeTaskDefinition,
} from '../types/daily-challenge-config.types';
import { ChallengeUnit, DailyChallengePersonalStar } from '../types/daily-challenge.types';

export const DEFAULT_PERSONAL_ROUNDS_PER_DAY = 3;
export const DEFAULT_PERSONAL_STAR_REWARDS: Readonly<DailyChallengePersonalStarValues> = {
  1: 80,
  2: 100,
  3: 120,
};
export const DEFAULT_PERSONAL_STAR_WEIGHTS: Readonly<DailyChallengePersonalStarValues> = {
  1: 1,
  2: 1,
  3: 1,
};
export const DEFAULT_PERSONAL_STAR_MULTIPLIERS: Readonly<DailyChallengePersonalStarValues> = {
  1: 0.75,
  2: 1,
  3: 1.5,
};

export interface ResolvedPersonalChallengeConfig {
  roundsPerDay: number;
  starRewards: DailyChallengePersonalStarValues;
  starWeights: DailyChallengePersonalStarValues;
  defaultStarMultipliers: DailyChallengePersonalStarValues;
}

export function resolvePersonalChallengeConfig(
  config: Pick<
    DailyChallengeConfigSnapshot,
    | 'personalRoundsPerDay'
    | 'personalStarRewards'
    | 'personalStarWeights'
    | 'personalDefaultStarMultipliers'
  >,
): ResolvedPersonalChallengeConfig {
  return {
    roundsPerDay: config.personalRoundsPerDay ?? DEFAULT_PERSONAL_ROUNDS_PER_DAY,
    starRewards: cloneStarValues(config.personalStarRewards ?? DEFAULT_PERSONAL_STAR_REWARDS),
    starWeights: cloneStarValues(config.personalStarWeights ?? DEFAULT_PERSONAL_STAR_WEIGHTS),
    defaultStarMultipliers: cloneStarValues(
      config.personalDefaultStarMultipliers ?? DEFAULT_PERSONAL_STAR_MULTIPLIERS,
    ),
  };
}

export function resolvePersonalTaskTarget(
  task: Pick<DailyChallengeTaskDefinition, 'target' | 'starTargets' | 'unit'>,
  star: DailyChallengePersonalStar,
  defaultMultipliers: Readonly<DailyChallengePersonalStarValues>,
): number {
  const explicitTarget = task.starTargets?.[star];
  if (explicitTarget !== undefined) {
    return explicitTarget;
  }

  const scaled = task.target * defaultMultipliers[star];
  if (task.unit === ChallengeUnit.MILLISECOND && scaled >= 1000) {
    return Math.max(1, Math.round(scaled / 1000) * 1000);
  }
  return Math.max(1, Math.round(scaled));
}

function cloneStarValues(
  values: Readonly<DailyChallengePersonalStarValues>,
): DailyChallengePersonalStarValues {
  return { 1: values[1], 2: values[2], 3: values[3] };
}
