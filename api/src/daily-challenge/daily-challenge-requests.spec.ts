import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AcceptDailyChallengeDto } from './dto/accept-daily-challenge.dto';
import { DailyChallengeMatchContributionDto } from './dto/daily-challenge-match-contribution.dto';
import { RefreshDailyChallengeDto } from './dto/refresh-daily-challenge.dto';
import { ChallengeMetric, DAILY_CHALLENGE_SNAPSHOT_VERSION } from './types/daily-challenge.types';

describe('daily challenge request DTOs', () => {
  it('requires idempotency request ids for accept and refresh intents', async () => {
    const accept = plainToInstance(AcceptDailyChallengeDto, {
      schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
      dayId: '2026-08-04',
      assignmentId: 'assignment-1',
    });
    const refresh = plainToInstance(RefreshDailyChallengeDto, {
      schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
      dayId: '2026-08-04',
    });

    expect((await validate(accept)).some((error) => error.property === 'requestId')).toBe(true);
    expect((await validate(refresh)).some((error) => error.property === 'requestId')).toBe(true);
  });

  it('rejects negative or fractional match contribution values', async () => {
    const base = {
      schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
      dataVersion: 1,
      dayId: '2026-08-04',
      matchStartedAt: '2026-08-04T03:00:00.000Z',
      players: [
        {
          steamId: 483215844,
          normallySettled: true,
          personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 10 }],
          globalMetrics: [],
        },
      ],
    };

    for (const value of [-1, 1.5]) {
      const dto = plainToInstance(DailyChallengeMatchContributionDto, {
        ...base,
        players: [
          {
            ...base.players[0],
            personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value }],
          },
        ],
      });
      expect(await validate(dto)).not.toHaveLength(0);
    }
  });

  it.each([1, 2])('accepts match contribution dataVersion %i', async (dataVersion) => {
    const dto = plainToInstance(DailyChallengeMatchContributionDto, {
      schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
      dataVersion,
      dayId: '2026-08-04',
      matchStartedAt: '2026-08-04T03:00:00.000Z',
      players: [],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a contribution dataVersion newer than the server protocol', async () => {
    const dto = plainToInstance(DailyChallengeMatchContributionDto, {
      schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
      dataVersion: 3,
      dayId: '2026-08-04',
      matchStartedAt: '2026-08-04T03:00:00.000Z',
      players: [],
    });

    expect((await validate(dto)).some((error) => error.property === 'dataVersion')).toBe(true);
  });
});
