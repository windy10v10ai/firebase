import { logger } from 'firebase-functions';

import { GameEndDto, GameEndGameOptionsDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';

import { PlayerStatsRecent } from './entities/player-stats-recent.entity';
import { PlayerStatsRecentService, RECENT_MATCH_LIMIT } from './player-stats-recent.service';

describe('PlayerStatsRecentService', () => {
  const findById = jest.fn();
  const update = jest.fn();
  const create = jest.fn();
  const repository = { findById, update, create };
  const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

  const defaultGameOptions: GameEndGameOptionsDto = {
    multiplierRadiant: 1,
    multiplierDire: 2,
    playerNumberRadiant: 1,
    playerNumberDire: 9,
    towerPowerPct: 120,
  };

  const basePlayer = (overrides: Partial<GameEndPlayerDto> = {}): GameEndPlayerDto =>
    ({
      heroName: 'npc_dota_hero_medusa',
      steamId: 123,
      teamId: 2,
      isDisconnected: false,
      level: 30,
      totalGoldEarned: 10000,
      kills: 5,
      deaths: 3,
      assists: 2,
      score: 10,
      battlePoints: 100,
      lastHits: 50,
      heroDamage: 5000,
      damageTaken: 1000,
      healing: 0,
      towerKills: 1,
      ...overrides,
    }) as GameEndPlayerDto;

  const baseGameEnd = (overrides: Partial<GameEndDto> = {}): GameEndDto =>
    ({
      matchId: 'm-1',
      version: 'v4.00',
      difficulty: 3,
      gameTimeMsec: 1_800_000,
      winnerTeamId: 2,
      gameOptions: defaultGameOptions,
      players: [],
      ...overrides,
    }) as GameEndDto;

  beforeEach(() => {
    findById.mockReset();
    update.mockReset();
    create.mockReset();
    warnSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it('should create the document with the match on first record', async () => {
    const service = new PlayerStatsRecentService(repository as never);
    findById.mockResolvedValueOnce(null);

    await service.record(
      basePlayer({ stuns: 12.5, roshanKills: 1, strength: 40, items: ['item_blink'] }),
      baseGameEnd(),
    );

    expect(create).toHaveBeenCalledTimes(1);
    const created = create.mock.calls[0][0] as PlayerStatsRecent;
    expect(created.id).toBe('123');
    expect(created.matches).toHaveLength(1);
    expect(created.matches[0]).toMatchObject({
      matchId: 'm-1',
      version: 'v4.00',
      difficulty: 3,
      durationSec: 1800,
      win: true,
      multiplierDire: 2,
      towerPowerPct: 120,
      heroName: 'npc_dota_hero_medusa',
      kills: 5,
      stuns: 12.5,
      roshanKills: 1,
      battlePoints: 100,
      strength: 40,
      items: ['item_blink'],
    });
  });

  it('should mark a loss when the team differs from the winner', async () => {
    const service = new PlayerStatsRecentService(repository as never);
    findById.mockResolvedValueOnce(null);

    await service.record(basePlayer({ teamId: 3 }), baseGameEnd());

    const created = create.mock.calls[0][0] as PlayerStatsRecent;
    expect(created.matches[0].win).toBe(false);
  });

  it('should prepend the new match and drop the oldest beyond the limit', async () => {
    const service = new PlayerStatsRecentService(repository as never);
    findById.mockResolvedValueOnce({
      id: '123',
      matches: Array.from({ length: RECENT_MATCH_LIMIT }, (_, index) => ({
        matchId: `old-${index}`,
      })),
      updatedAt: new Date(),
    } as PlayerStatsRecent);

    await service.record(basePlayer(), baseGameEnd({ matchId: 'newest' }));

    const updated = update.mock.calls[0][0] as PlayerStatsRecent;
    expect(updated.matches).toHaveLength(RECENT_MATCH_LIMIT);
    expect(updated.matches[0].matchId).toBe('newest');
    expect(updated.matches[1].matchId).toBe('old-0');
    expect(updated.matches[RECENT_MATCH_LIMIT - 1].matchId).toBe(`old-${RECENT_MATCH_LIMIT - 2}`);
  });

  it('should reset an over-limit field to 0 and still record the match', async () => {
    const service = new PlayerStatsRecentService(repository as never);
    findById.mockResolvedValueOnce(null);

    await service.record(basePlayer({ totalGoldEarned: 999_999_999 }), baseGameEnd());

    const created = create.mock.calls[0][0] as PlayerStatsRecent;
    expect(created.matches[0].totalGoldEarned).toBe(0);
    expect(created.matches[0].kills).toBe(5);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('should no-op for bot steamId', async () => {
    const service = new PlayerStatsRecentService(repository as never);

    await service.record(basePlayer({ steamId: 0 }), baseGameEnd());

    expect(findById).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('should skip the match for point-farming game options', async () => {
    const service = new PlayerStatsRecentService(repository as never);

    await service.record(
      basePlayer(),
      baseGameEnd({ gameOptions: { ...defaultGameOptions, multiplierRadiant: 3 } }),
    );

    expect(findById).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
