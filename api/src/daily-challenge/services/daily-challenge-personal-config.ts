import {
  DailyChallengeConfigSnapshot,
  DailyChallengePersonalStarValues,
  DailyChallengeTaskDefinition,
} from '../types/daily-challenge-config.types';
import {
  ChallengeUnit,
  DAILY_CHALLENGE_METRIC_UNIT,
  DailyChallengePersonalStar,
} from '../types/daily-challenge.types';

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
    roundsPerDay: config.personalRoundsPerDay,
    starRewards: cloneStarValues(config.personalStarRewards),
    starWeights: cloneStarValues(config.personalStarWeights),
    defaultStarMultipliers: cloneStarValues(config.personalDefaultStarMultipliers),
  };
}

export function resolvePersonalTaskTarget(
  task: Pick<DailyChallengeTaskDefinition, 'target' | 'starTargets' | 'metric'>,
  star: DailyChallengePersonalStar,
  defaultMultipliers: Readonly<DailyChallengePersonalStarValues>,
): number {
  const explicitTarget = task.starTargets?.[star];
  if (explicitTarget !== undefined) {
    return explicitTarget;
  }

  const scaled = task.target * defaultMultipliers[star];
  if (DAILY_CHALLENGE_METRIC_UNIT[task.metric] === ChallengeUnit.MILLISECOND && scaled >= 1000) {
    return Math.max(1, Math.round(scaled / 1000) * 1000);
  }
  return Math.max(1, Math.round(scaled));
}

function cloneStarValues(
  values: Readonly<DailyChallengePersonalStarValues>,
): DailyChallengePersonalStarValues {
  return { 1: values[1], 2: values[2], 3: values[3] };
}
