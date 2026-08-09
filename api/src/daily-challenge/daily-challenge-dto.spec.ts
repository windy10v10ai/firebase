import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { DailyChallengePlayerSnapshotDto } from './dto/daily-challenge-player-snapshot.dto';
import { DailyChallengeTaskSnapshotDto } from './dto/daily-challenge-task-snapshot.dto';
import {
  ChallengeDayStatus,
  ChallengeMetric,
  ChallengeScope,
  ChallengeUnit,
  DAILY_CHALLENGE_SNAPSHOT_VERSION,
} from './types/daily-challenge.types';

const validTask = {
  assignmentId: 'assignment-1',
  taskId: 'deal-damage-500k',
  configVersion: 7,
  scope: ChallengeScope.PERSONAL_GENERAL,
  metric: ChallengeMetric.HERO_DAMAGE,
  unit: ChallengeUnit.DAMAGE,
  title: { cn: '造成伤害', en: 'Deal damage', ru: 'Наносите урон' },
  description: {
    cn: '累计造成50万伤害',
    en: 'Deal 500,000 damage',
    ru: 'Нанесите 500 000 урона',
  },
  target: 500000,
  progress: 120000,
  rewardSeasonPoint: 100,
};

describe('daily challenge DTO validation', () => {
  it('accepts a supported non-negative integer task snapshot', async () => {
    const dto = plainToInstance(DailyChallengeTaskSnapshotDto, {
      ...validTask,
      revision: 1,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('requires a positive task revision in every task snapshot', async () => {
    const missingRevision = plainToInstance(DailyChallengeTaskSnapshotDto, validTask);
    const invalidRevision = plainToInstance(DailyChallengeTaskSnapshotDto, {
      ...validTask,
      revision: 0,
    });

    expect((await validate(missingRevision)).some((error) => error.property === 'revision')).toBe(
      true,
    );
    expect((await validate(invalidRevision)).some((error) => error.property === 'revision')).toBe(
      true,
    );
  });

  it('accepts a hero name only when it is a non-empty string', async () => {
    const validHeroTask = plainToInstance(DailyChallengeTaskSnapshotDto, {
      ...validTask,
      revision: 1,
      scope: ChallengeScope.PERSONAL_HERO,
      heroName: 'npc_dota_hero_lina',
    });
    const invalidHeroTask = plainToInstance(DailyChallengeTaskSnapshotDto, {
      ...validTask,
      revision: 1,
      scope: ChallengeScope.PERSONAL_HERO,
      heroName: '',
    });

    await expect(validate(validHeroTask)).resolves.toHaveLength(0);
    expect((await validate(invalidHeroTask)).some((error) => error.property === 'heroName')).toBe(
      true,
    );
  });
  it('rejects an unknown metric', async () => {
    const dto = plainToInstance(DailyChallengeTaskSnapshotDto, {
      ...validTask,
      metric: 'unknown_metric',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it.each([
    ['negative target', -1],
    ['decimal target', 1.5],
  ])('rejects %s', async (_name, target) => {
    const dto = plainToInstance(DailyChallengeTaskSnapshotDto, { ...validTask, target });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires the snapshot protocol version', async () => {
    const dto = plainToInstance(DailyChallengePlayerSnapshotDto, {
      steamId: 483215844,
      dayId: '2026-08-04',
      status: ChallengeDayStatus.OPEN,
      startsAt: '2026-08-04T00:00:00.000Z',
      endsAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-04T01:00:00.000Z',
      totalRounds: 3,
      currentRound: 1,
      completedRoundCount: 0,
      completedTasks: [],
      candidates: [{ ...validTask, revision: 1 }],
      unreadRewardCount: 0,
      recentRewards: [],
      needsSelection: true,
      streak: {
        currentDays: 0,
        cycleTargetDays: 30,
        nextMilestoneDays: 3,
        nextMilestoneRewardSeasonPoint: 50,
      },
      refresh: {
        isMember: true,
        freeRefreshAvailable: true,
        paidRefreshesUsed: 0,
        paidRefreshesRemaining: 5,
        nextCostMemberPoint: 10,
      },
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'schemaVersion')).toBe(true);

    const valid = plainToInstance(DailyChallengePlayerSnapshotDto, {
      ...dto,
      schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
    });
    await expect(validate(valid)).resolves.toHaveLength(0);
  });

  it('rejects legacy player snapshot protocol version 1', async () => {
    const dto = plainToInstance(DailyChallengePlayerSnapshotDto, {
      schemaVersion: 1,
      steamId: 483215844,
      dayId: '2026-08-04',
      status: ChallengeDayStatus.OPEN,
      startsAt: '2026-08-04T00:00:00.000Z',
      endsAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-04T01:00:00.000Z',
      totalRounds: 3,
      currentRound: 1,
      completedRoundCount: 0,
      completedTasks: [],
      candidates: [],
      unreadRewardCount: 0,
      recentRewards: [],
      needsSelection: true,
      streak: { currentDays: 0, cycleTargetDays: 30 },
      refresh: {
        isMember: false,
        freeRefreshAvailable: false,
        paidRefreshesUsed: 0,
        paidRefreshesRemaining: 0,
      },
    });

    expect((await validate(dto)).some((error) => error.property === 'schemaVersion')).toBe(true);
  });
});
