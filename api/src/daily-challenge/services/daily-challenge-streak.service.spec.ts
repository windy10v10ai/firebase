import { DailyChallengeStreakMilestone } from '../types/daily-challenge-config.types';

import { DailyChallengeStreakService } from './daily-challenge-streak.service';

const milestones: DailyChallengeStreakMilestone[] = [
  { days: 3, rewardSeasonPoint: 50 },
  { days: 7, rewardSeasonPoint: 100 },
  { days: 14, rewardSeasonPoint: 200 },
  { days: 30, rewardSeasonPoint: 500 },
];

describe('DailyChallengeStreakService', () => {
  const service = new DailyChallengeStreakService();

  it('starts a new cycle at day one after a completed personal challenge', () => {
    expect(
      service.settle({
        dayId: '2026-08-04',
        completed: true,
        previousDays: 0,
        milestones,
      }),
    ).toEqual({
      storedDays: 1,
      cycleId: '2026-08-04',
    });
  });

  it('keeps the existing cycle and emits a separate milestone reward', () => {
    expect(
      service.settle({
        dayId: '2026-08-04',
        completed: true,
        previousDays: 2,
        previousCycleId: '2026-08-02',
        milestones,
      }),
    ).toEqual({
      storedDays: 3,
      cycleId: '2026-08-02',
      milestone: { days: 3, rewardSeasonPoint: 50 },
    });
  });

  it('resets the streak immediately when the personal challenge was not completed', () => {
    expect(
      service.settle({
        dayId: '2026-08-04',
        completed: false,
        previousDays: 6,
        previousCycleId: '2026-07-29',
        milestones,
      }),
    ).toEqual({
      storedDays: 0,
      cycleId: '2026-08-04',
    });
  });

  it('resets stored progress after granting the configured highest milestone', () => {
    expect(
      service.settle({
        dayId: '2026-08-04',
        completed: true,
        previousDays: 29,
        previousCycleId: '2026-07-06',
        milestones,
      }),
    ).toEqual({
      storedDays: 0,
      cycleId: '2026-07-06',
      milestone: { days: 30, rewardSeasonPoint: 500 },
      cycleCompleted: true,
    });
  });

  it('uses the largest configured milestone rather than a hard-coded 30-day cycle', () => {
    expect(
      service.settle({
        dayId: '2026-08-04',
        completed: true,
        previousDays: 6,
        previousCycleId: '2026-07-29',
        milestones: milestones.slice(0, 2),
      }),
    ).toEqual({
      storedDays: 0,
      cycleId: '2026-07-29',
      milestone: { days: 7, rewardSeasonPoint: 100 },
      cycleCompleted: true,
    });
  });
});
