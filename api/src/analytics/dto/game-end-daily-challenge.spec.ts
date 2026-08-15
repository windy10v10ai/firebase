import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  ChallengeMetric,
  DAILY_CHALLENGE_SNAPSHOT_VERSION,
} from '../../daily-challenge/types/daily-challenge.types';

import { GameEndDto } from './game-end-dto';

describe('GameEndDto daily challenge contribution', () => {
  it('validates the optional nested challenge payload when present', async () => {
    const dto = plainToInstance(GameEndDto, {
      matchId: '1',
      version: 'v4.00',
      difficulty: 1,
      gameOptions: {},
      winnerTeamId: 2,
      gameTimeMsec: 1000,
      players: [
        {
          heroName: 'npc_dota_hero_crystal_maiden',
          steamId: 483215844,
          teamId: 2,
          isDisconnected: false,
          level: 30,
          totalGoldEarned: 1000,
          kills: 1,
          deaths: 0,
          assists: 2,
          score: 1,
          battlePoints: 10,
          lastHits: 10,
          heroDamage: 100,
          damageTaken: 100,
          healing: 0,
          towerKills: 0,
        },
      ],
      dailyChallenge: {
        schemaVersion: DAILY_CHALLENGE_SNAPSHOT_VERSION,
        dataVersion: 1,
        dayId: '2026-08-04',
        matchStartedAt: '2026-08-04T03:00:00.000Z',
        players: [
          {
            steamId: 483215844,
            normallySettled: true,
            personalMetrics: [{ metric: ChallengeMetric.HERO_DAMAGE, value: 1.5 }],
            globalMetrics: [],
          },
        ],
      },
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
