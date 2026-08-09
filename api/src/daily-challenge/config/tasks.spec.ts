import { ChallengeScope } from '../types/daily-challenge.types';

import { DAILY_CHALLENGE_CONFIG, DAILY_CHALLENGE_TASKS } from './tasks';

describe('daily challenge code configuration', () => {
  it('keeps the reviewed 404-task pool in typed source code', () => {
    expect(DAILY_CHALLENGE_TASKS).toHaveLength(404);
    expect(
      DAILY_CHALLENGE_TASKS.filter((task) => task.scope === ChallengeScope.PERSONAL_GENERAL),
    ).toHaveLength(19);
    expect(
      DAILY_CHALLENGE_TASKS.filter((task) => task.scope === ChallengeScope.PERSONAL_HERO),
    ).toHaveLength(381);
    expect(
      DAILY_CHALLENGE_TASKS.filter((task) => task.scope === ChallengeScope.GLOBAL),
    ).toHaveLength(4);
    expect(new Set(DAILY_CHALLENGE_TASKS.map((task) => task.id)).size).toBe(404);
  });

  it('contains only runtime task data instead of localized or derivable fields', () => {
    for (const task of DAILY_CHALLENGE_TASKS) {
      expect(task).not.toHaveProperty('title');
      expect(task).not.toHaveProperty('description');
      expect(task).not.toHaveProperty('groupTags');
      expect(task).not.toHaveProperty('mutexTags');
      expect(task).not.toHaveProperty('rewardSeasonPoint');
      expect(task).not.toHaveProperty('unit');
      expect(task).not.toHaveProperty('weight');
    }
  });

  it('keeps only the small operational values beside the code task pool', () => {
    expect(DAILY_CHALLENGE_CONFIG.personalRoundsPerDay).toBe(3);
    expect(DAILY_CHALLENGE_CONFIG.personalStarRewards).toEqual({
      1: 80,
      2: 100,
      3: 120,
    });
    expect(DAILY_CHALLENGE_CONFIG).not.toHaveProperty('globalTargetPolicies');
    expect(DAILY_CHALLENGE_CONFIG.refreshCostsMemberPoint).toHaveLength(5);
    expect(DAILY_CHALLENGE_CONFIG.streakMilestones).toHaveLength(4);
  });
});
