import { DAILY_CHALLENGE_CONFIG } from '../config/tasks';
import { ChallengeMetric, ChallengeScope } from '../types/daily-challenge.types';

import {
  resolvePersonalChallengeConfig,
  resolvePersonalTaskTarget,
} from './daily-challenge-personal-config';

describe('daily challenge personal star configuration', () => {
  it('uses the explicit code configuration for rounds, rewards, weights and multipliers', () => {
    expect(resolvePersonalChallengeConfig(DAILY_CHALLENGE_CONFIG)).toEqual({
      roundsPerDay: DAILY_CHALLENGE_CONFIG.personalRoundsPerDay,
      starRewards: DAILY_CHALLENGE_CONFIG.personalStarRewards,
      starWeights: DAILY_CHALLENGE_CONFIG.personalStarWeights,
      defaultStarMultipliers: DAILY_CHALLENGE_CONFIG.personalDefaultStarMultipliers,
    });
  });

  it('prefers explicit task starTargets over default multipliers', () => {
    const task = {
      scope: ChallengeScope.PERSONAL_GENERAL,
      metric: ChallengeMetric.BOT_KILLS,
      target: 150,
      starTargets: { 1: 100, 2: 150, 3: 300 },
    };

    expect(
      resolvePersonalTaskTarget(task, 1, DAILY_CHALLENGE_CONFIG.personalDefaultStarMultipliers),
    ).toBe(100);
    expect(
      resolvePersonalTaskTarget(task, 2, DAILY_CHALLENGE_CONFIG.personalDefaultStarMultipliers),
    ).toBe(150);
    expect(
      resolvePersonalTaskTarget(task, 3, DAILY_CHALLENGE_CONFIG.personalDefaultStarMultipliers),
    ).toBe(300);
  });

  it('uses the two-star target as the baseline and rounds by metric unit', () => {
    const countTask = {
      scope: ChallengeScope.PERSONAL_GENERAL,
      metric: ChallengeMetric.BOT_KILLS,
      target: 101,
    };
    const durationTask = {
      scope: ChallengeScope.PERSONAL_HERO,
      metric: ChallengeMetric.STUN_DURATION_MS,
      target: 101_000,
    };

    expect(
      resolvePersonalTaskTarget(
        countTask,
        1,
        DAILY_CHALLENGE_CONFIG.personalDefaultStarMultipliers,
      ),
    ).toBe(76);
    expect(
      resolvePersonalTaskTarget(
        countTask,
        2,
        DAILY_CHALLENGE_CONFIG.personalDefaultStarMultipliers,
      ),
    ).toBe(101);
    expect(
      resolvePersonalTaskTarget(
        countTask,
        3,
        DAILY_CHALLENGE_CONFIG.personalDefaultStarMultipliers,
      ),
    ).toBe(152);
    expect(
      resolvePersonalTaskTarget(
        durationTask,
        1,
        DAILY_CHALLENGE_CONFIG.personalDefaultStarMultipliers,
      ),
    ).toBe(76_000);
  });
});
