import { logger } from 'firebase-functions';

import { GameEndGameOptionsDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';

import { PlayerStatsLifetime } from './entities/player-stats-lifetime.entity';
import { PlayerStatsLifetimeService } from './player-stats-lifetime.service';

describe('PlayerStatsLifetimeService', () => {
  const findById = jest.fn();
  const update = jest.fn();
  const create = jest.fn();
  const repository = { findById, update, create };
  const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

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

  const defaultGameOptions: GameEndGameOptionsDto = {
    multiplierRadiant: 1,
    multiplierDire: 1,
    playerNumberRadiant: 1,
    playerNumberDire: 1,
    towerPowerPct: 100,
  };

  beforeEach(() => {
    findById.mockReset();
    update.mockReset();
    create.mockReset();
    warnSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it('should skip invalid field contribution and keep other fields', async () => {
    const service = new PlayerStatsLifetimeService(repository as never);
    findById.mockResolvedValueOnce({
      id: '123',
      kills: 10,
      deaths: 10,
      assists: 10,
      lastHits: 10,
      heroDamage: 2000,
      damageTaken: 10,
      healing: 10,
      towerKills: 10,
      totalGoldEarned: 10,
      updatedAt: new Date(),
    } as PlayerStatsLifetime);

    await service.accumulate(123, basePlayer({ heroDamage: undefined as never }), {
      matchId: 'm-1',
      gameOptions: defaultGameOptions,
    });

    expect(update).toHaveBeenCalledTimes(1);
    const updated = update.mock.calls[0][0] as PlayerStatsLifetime;
    expect(updated.heroDamage).toBe(2000);
    expect(updated.kills).toBe(15);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('should heal NaN base value when delta is valid', async () => {
    const service = new PlayerStatsLifetimeService(repository as never);
    findById.mockResolvedValueOnce({
      id: '123',
      kills: 0,
      deaths: 0,
      assists: 0,
      lastHits: 0,
      heroDamage: Number.NaN,
      damageTaken: 0,
      healing: 0,
      towerKills: 0,
      totalGoldEarned: 0,
      updatedAt: new Date(),
    } as PlayerStatsLifetime);

    await service.accumulate(123, basePlayer({ heroDamage: 321 }), {
      matchId: 'm-2',
      gameOptions: defaultGameOptions,
    });

    const updated = update.mock.calls[0][0] as PlayerStatsLifetime;
    expect(updated.heroDamage).toBe(321);
  });

  it('should no-op for bot steamId', async () => {
    const service = new PlayerStatsLifetimeService(repository as never);

    await service.accumulate(0, basePlayer(), {
      matchId: 'm-bot',
      gameOptions: defaultGameOptions,
    });

    expect(findById).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('should skip whole accumulation when respawnTimePct is below threshold', async () => {
    const service = new PlayerStatsLifetimeService(repository as never);
    findById.mockResolvedValueOnce(null);

    await service.accumulate(123, basePlayer(), {
      matchId: 'm-respawn',
      gameOptions: { ...defaultGameOptions, respawnTimePct: 30 },
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('should skip whole accumulation for custom mode options', async () => {
    const service = new PlayerStatsLifetimeService(repository as never);
    findById.mockResolvedValueOnce(null);

    await service.accumulate(123, basePlayer(), {
      matchId: 'm-3',
      gameOptions: { ...defaultGameOptions, multiplierRadiant: 3 },
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('should skip over max contribution field', async () => {
    const service = new PlayerStatsLifetimeService(repository as never);
    findById.mockResolvedValueOnce({
      id: '123',
      kills: 1,
      deaths: 1,
      assists: 1,
      lastHits: 1,
      heroDamage: 1,
      damageTaken: 1,
      healing: 1,
      towerKills: 1,
      totalGoldEarned: 1,
      updatedAt: new Date(),
    } as PlayerStatsLifetime);

    await service.accumulate(123, basePlayer({ totalGoldEarned: 999999999 }), {
      matchId: 'm-4',
      gameOptions: defaultGameOptions,
    });

    const updated = update.mock.calls[0][0] as PlayerStatsLifetime;
    expect(updated.totalGoldEarned).toBe(1);
    expect(updated.kills).toBe(6);
  });
});
