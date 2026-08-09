import { ChallengeScope, ChallengeUnit } from '../types/daily-challenge.types';

import {
  DEFAULT_PERSONAL_ROUNDS_PER_DAY,
  DEFAULT_PERSONAL_STAR_MULTIPLIERS,
  DEFAULT_PERSONAL_STAR_REWARDS,
  DEFAULT_PERSONAL_STAR_WEIGHTS,
  resolvePersonalChallengeConfig,
  resolvePersonalTaskTarget,
} from './daily-challenge-personal-config';

describe('daily challenge personal star configuration', () => {
  it('uses versioned defaults when legacy published config omits personal star fields', () => {
    expect(resolvePersonalChallengeConfig({} as any)).toEqual({
      roundsPerDay: DEFAULT_PERSONAL_ROUNDS_PER_DAY,
      starRewards: DEFAULT_PERSONAL_STAR_REWARDS,
      starWeights: DEFAULT_PERSONAL_STAR_WEIGHTS,
      defaultStarMultipliers: DEFAULT_PERSONAL_STAR_MULTIPLIERS,
    });
  });

  it('prefers explicit task starTargets over default multipliers', () => {
    const task = {
      scope: ChallengeScope.PERSONAL_GENERAL,
      unit: ChallengeUnit.COUNT,
      target: 150,
      starTargets: { 1: 100, 2: 150, 3: 300 },
    } as any;

    expect(resolvePersonalTaskTarget(task, 1, DEFAULT_PERSONAL_STAR_MULTIPLIERS)).toBe(100);
    expect(resolvePersonalTaskTarget(task, 2, DEFAULT_PERSONAL_STAR_MULTIPLIERS)).toBe(150);
    expect(resolvePersonalTaskTarget(task, 3, DEFAULT_PERSONAL_STAR_MULTIPLIERS)).toBe(300);
  });

  it('uses the two-star target as the legacy baseline and rounds by unit', () => {
    const countTask = {
      scope: ChallengeScope.PERSONAL_GENERAL,
      unit: ChallengeUnit.COUNT,
      target: 101,
    } as any;
    const durationTask = {
      scope: ChallengeScope.PERSONAL_HERO,
      unit: ChallengeUnit.MILLISECOND,
      target: 101_000,
    } as any;

    expect(resolvePersonalTaskTarget(countTask, 1, DEFAULT_PERSONAL_STAR_MULTIPLIERS)).toBe(76);
    expect(resolvePersonalTaskTarget(countTask, 2, DEFAULT_PERSONAL_STAR_MULTIPLIERS)).toBe(101);
    expect(resolvePersonalTaskTarget(countTask, 3, DEFAULT_PERSONAL_STAR_MULTIPLIERS)).toBe(152);
    expect(resolvePersonalTaskTarget(durationTask, 1, DEFAULT_PERSONAL_STAR_MULTIPLIERS)).toBe(
      76_000,
    );
  });
});
