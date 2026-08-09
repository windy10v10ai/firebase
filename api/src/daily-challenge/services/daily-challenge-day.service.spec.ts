import { DAILY_CHALLENGE_CONFIG } from '../config/tasks';
import { DailyChallengeDay } from '../entities/daily-challenge-day.entity';
import { ChallengeDayStatus, ChallengeScope } from '../types/daily-challenge.types';

import { DailyChallengeDayService } from './daily-challenge-day.service';
import { DailyChallengeDayStore } from './daily-challenge-day.store';
import { DailyChallengeGenerationService } from './daily-challenge-generation.service';

const now = new Date('2026-08-04T04:00:00.000Z');
const window = {
  dayId: '2026-08-04',
  startsAt: new Date('2026-08-03T16:00:00.000Z'),
  endsAt: new Date('2026-08-04T16:00:00.000Z'),
  closesAt: new Date('2026-08-04T18:00:00.000Z'),
};

class MemoryDailyChallengeDayStore extends DailyChallengeDayStore {
  private readonly days = new Map<string, DailyChallengeDay>();

  async getOrCreate(dayId: string, factory: () => DailyChallengeDay): Promise<DailyChallengeDay> {
    if (!this.days.has(dayId)) {
      this.days.set(dayId, structuredClone(factory()));
    }
    return structuredClone(this.days.get(dayId));
  }
}

describe('DailyChallengeDayService', () => {
  it('freezes one code-configured global task for every player on the challenge day', async () => {
    const service = new DailyChallengeDayService(
      ...([
        new MemoryDailyChallengeDayStore(),
        new DailyChallengeGenerationService(),
        { getWindow: jest.fn(() => window) },
      ] as unknown as ConstructorParameters<typeof DailyChallengeDayService>),
    );

    const first = await service.getOrCreate(now);
    const second = await service.getOrCreate(now);

    expect(first).toEqual(second);
    expect(first.status).toBe(ChallengeDayStatus.OPEN);
    expect(first.configVersionId).toBe(DAILY_CHALLENGE_CONFIG.id);
    expect(first.configVersion).toBe(DAILY_CHALLENGE_CONFIG.version);
    expect(first.globalTask.scope).toBe(ChallengeScope.GLOBAL);
    expect(
      DAILY_CHALLENGE_CONFIG.tasks.some(
        (task) => task.scope === ChallengeScope.GLOBAL && task.id === first.globalTask.taskId,
      ),
    ).toBe(true);
    expect(first.globalRewardTiers).toEqual(DAILY_CHALLENGE_CONFIG.globalRewardTiers);
  });
});
