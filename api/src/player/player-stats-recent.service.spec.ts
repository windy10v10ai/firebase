import { logger } from 'firebase-functions';

import { GameEndDto, GameEndGameOptionsDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';

import { PlayerStatsRecent, PlayerStatsRecentArchive } from './entities/player-stats-recent.entity';
import { PlayerStatsRecentService, RECENT_MATCH_LIMIT } from './player-stats-recent.service';

describe('PlayerStatsRecentService', () => {
  const findById = jest.fn();
  const update = jest.fn();
  const create = jest.fn();
  const repository = { findById, update, create };
  const archiveFindById = jest.fn();
  const archiveUpdate = jest.fn();
  const archiveCreate = jest.fn();
  const archiveRepository = {
    findById: archiveFindById,
    update: archiveUpdate,
    create: archiveCreate,
  };
  const newService = () =>
    new PlayerStatsRecentService(repository as never, archiveRepository as never);
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
    archiveFindById.mockReset();
    archiveUpdate.mockReset();
    archiveCreate.mockReset();
    warnSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it('should create the document with the match on first record', async () => {
    const service = newService();
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
    const service = newService();
    findById.mockResolvedValueOnce(null);

    await service.record(basePlayer({ teamId: 3 }), baseGameEnd());

    const created = create.mock.calls[0][0] as PlayerStatsRecent;
    expect(created.matches[0].win).toBe(false);
  });

  const matchesOf = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({ matchId: `${prefix}-${index}` }));

  it('should prepend the new match and keep growing below the archive trigger', async () => {
    const service = newService();
    findById.mockResolvedValueOnce({
      id: '123',
      matches: matchesOf('old', RECENT_MATCH_LIMIT),
      updatedAt: new Date(),
    } as PlayerStatsRecent);

    await service.record(basePlayer(), baseGameEnd({ matchId: 'newest' }));

    const updated = update.mock.calls[0][0] as PlayerStatsRecent;
    expect(updated.matches).toHaveLength(RECENT_MATCH_LIMIT + 1);
    expect(updated.matches[0].matchId).toBe('newest');
    expect(updated.matches[1].matchId).toBe('old-0');
    expect(archiveCreate).not.toHaveBeenCalled();
  });

  it('should move the oldest batch into a new archive page once the document is full', async () => {
    const service = newService();
    findById.mockResolvedValueOnce({
      id: '123',
      matches: matchesOf('old', RECENT_MATCH_LIMIT * 2 - 1),
      archivedPages: 2,
      updatedAt: new Date(),
    } as PlayerStatsRecent);
    archiveFindById.mockResolvedValueOnce(null);

    await service.record(basePlayer(), baseGameEnd({ matchId: 'newest' }));

    const archive = archiveCreate.mock.calls[0][0] as PlayerStatsRecentArchive;
    expect(archive.id).toBe('123_3');
    expect(archive.matches).toHaveLength(RECENT_MATCH_LIMIT);
    expect(archive.matches[0].matchId).toBe(`old-${RECENT_MATCH_LIMIT - 1}`);
    expect(archive.matches[RECENT_MATCH_LIMIT - 1].matchId).toBe(
      `old-${RECENT_MATCH_LIMIT * 2 - 2}`,
    );
    const updated = update.mock.calls[0][0] as PlayerStatsRecent;
    expect(updated.matches).toHaveLength(RECENT_MATCH_LIMIT);
    expect(updated.matches[0].matchId).toBe('newest');
    expect(updated.archivedPages).toBe(3);
  });

  it('should overwrite an archive page left behind by an interrupted move', async () => {
    const service = newService();
    findById.mockResolvedValueOnce({
      id: '123',
      matches: matchesOf('old', RECENT_MATCH_LIMIT * 2 - 1),
      updatedAt: new Date(),
    } as PlayerStatsRecent);
    archiveFindById.mockResolvedValueOnce({ id: '123_1', matches: [] });

    await service.record(basePlayer(), baseGameEnd());

    expect(archiveCreate).not.toHaveBeenCalled();
    expect(archiveUpdate).toHaveBeenCalledTimes(1);
    expect((update.mock.calls[0][0] as PlayerStatsRecent).archivedPages).toBe(1);
  });

  describe('findHistory', () => {
    it('should return the overflow of the document and the newest archive page together', async () => {
      const service = newService();
      findById.mockResolvedValueOnce({
        id: '123',
        matches: matchesOf('main', RECENT_MATCH_LIMIT + 2),
        archivedPages: 3,
      });
      archiveFindById.mockResolvedValueOnce({
        id: '123_3',
        matches: matchesOf('p3', RECENT_MATCH_LIMIT),
      });

      const result = await service.findHistory(123);

      expect(archiveFindById).toHaveBeenCalledWith('123_3');
      expect(result.matches).toHaveLength(RECENT_MATCH_LIMIT + 2);
      expect(result.matches[0].matchId).toBe(`main-${RECENT_MATCH_LIMIT}`);
      expect(result.matches[2].matchId).toBe('p3-0');
      expect(result.nextPage).toBe(2);
    });

    it('should return only the overflow when nothing has been archived yet', async () => {
      const service = newService();
      findById.mockResolvedValueOnce({
        id: '123',
        matches: matchesOf('main', RECENT_MATCH_LIMIT + 5),
      });

      const result = await service.findHistory(123);

      expect(archiveFindById).not.toHaveBeenCalled();
      expect(result.matches).toHaveLength(5);
      expect(result.nextPage).toBeNull();
    });

    it('should read one archive page at a time when a page is given', async () => {
      const service = newService();
      findById.mockResolvedValueOnce({ id: '123', matches: [], archivedPages: 3 });
      archiveFindById.mockResolvedValueOnce({
        id: '123_2',
        matches: matchesOf('p2', RECENT_MATCH_LIMIT),
      });

      const result = await service.findHistory(123, 2);

      expect(archiveFindById).toHaveBeenCalledTimes(1);
      expect(result.matches).toHaveLength(RECENT_MATCH_LIMIT);
      expect(result.nextPage).toBe(1);
    });

    it('should stop at the first page and clamp a page past the end', async () => {
      const service = newService();
      findById.mockResolvedValueOnce({ id: '123', matches: [], archivedPages: 1 });
      archiveFindById.mockResolvedValueOnce({
        id: '123_1',
        matches: matchesOf('p1', RECENT_MATCH_LIMIT),
      });

      const result = await service.findHistory(123, 9);

      expect(archiveFindById).toHaveBeenCalledWith('123_1');
      expect(result.nextPage).toBeNull();
    });

    it('should return nothing for a player without records', async () => {
      const service = newService();
      findById.mockResolvedValueOnce(null);

      expect(await service.findHistory(123)).toEqual({ matches: [], nextPage: null });
    });
  });

  it('should reset an over-limit field to 0 and still record the match', async () => {
    const service = newService();
    findById.mockResolvedValueOnce(null);

    await service.record(basePlayer({ totalGoldEarned: 999_999_999 }), baseGameEnd());

    const created = create.mock.calls[0][0] as PlayerStatsRecent;
    expect(created.matches[0].totalGoldEarned).toBe(0);
    expect(created.matches[0].kills).toBe(5);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('should no-op for bot steamId', async () => {
    const service = newService();

    await service.record(basePlayer({ steamId: 0 }), baseGameEnd());

    expect(findById).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('should skip the match for point-farming game options', async () => {
    const service = newService();

    await service.record(
      basePlayer(),
      baseGameEnd({ gameOptions: { ...defaultGameOptions, multiplierRadiant: 3 } }),
    );

    expect(findById).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
