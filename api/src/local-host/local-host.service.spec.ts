import { GameEndDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';

import { LocalRateLimit } from './entities/local-rate-limit.entity';
import { LocalHostService } from './local-host.service';

function createFakeRateLimitRepository() {
  const store = new Map<string, LocalRateLimit>();
  return {
    repository: {
      findById: jest.fn((id: string) => Promise.resolve(store.get(id) ?? null)),
      update: jest.fn((doc: LocalRateLimit) => {
        store.set(doc.id, doc);
        return Promise.resolve(doc);
      }),
      create: jest.fn((doc: LocalRateLimit) => {
        store.set(doc.id, doc);
        return Promise.resolve(doc);
      }),
    },
    store,
  };
}

function createPlayerDto(overrides: Partial<GameEndPlayerDto> = {}): GameEndPlayerDto {
  return {
    heroName: 'npc_dota_hero_abaddon',
    steamId: 1,
    teamId: 2,
    isDisconnected: false,
    level: 20,
    totalGoldEarned: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    score: 0,
    battlePoints: 200,
    lastHits: 0,
    heroDamage: 0,
    damageTaken: 0,
    healing: 0,
    towerKills: 0,
    ...overrides,
  };
}

function createGameEndDto(overrides: Partial<GameEndDto> = {}): GameEndDto {
  return {
    matchId: 'match-1',
    version: 'v4.00',
    difficulty: 0,
    gameOptions: {
      multiplierRadiant: 1,
      multiplierDire: 1,
      playerNumberRadiant: 1,
      playerNumberDire: 1,
      towerPowerPct: 100,
    },
    winnerTeamId: 2,
    gameTimeMsec: 1_000,
    players: [createPlayerDto()],
    ...overrides,
  };
}

describe('LocalHostService', () => {
  function createService(existingPlayers: Record<number, { matchCount: number } | undefined> = {}) {
    const { repository, store } = createFakeRateLimitRepository();
    const playerService = {
      normalizeBattlePoints: jest.fn((points: number) => Math.min(500, Math.max(0, points))),
      findBySteamId: jest.fn((steamId: number) =>
        Promise.resolve(steamId in existingPlayers ? existingPlayers[steamId] : { matchCount: 20 }),
      ),
      addLocalSeasonPoints: jest.fn().mockResolvedValue(undefined),
    };
    const dailyTaskService = {
      recordGameEnd: jest.fn().mockResolvedValue(undefined),
    };
    const service = new LocalHostService(
      repository as never,
      playerService as never,
      dailyTaskService as never,
    );
    return { service, store, playerService, dailyTaskService };
  }

  it('合法请求：加分、记录每日任务', async () => {
    const { service, playerService, dailyTaskService } = createService();
    const gameEnd = createGameEndDto();

    await service.settle(gameEnd);

    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledWith(1, 200);
    expect(dailyTaskService.recordGameEnd).toHaveBeenCalledWith(gameEnd.players);
  });

  it('steamId <= 0 的玩家跳过，不加分', async () => {
    const { service, playerService } = createService();
    const gameEnd = createGameEndDto({ players: [createPlayerDto({ steamId: 0 })] });

    await service.settle(gameEnd);

    expect(playerService.addLocalSeasonPoints).not.toHaveBeenCalled();
  });

  it('玩家不存在时拒绝，不加分，也不记录每日任务', async () => {
    const { service, playerService, dailyTaskService } = createService({ 1: undefined });
    const gameEnd = createGameEndDto();

    await service.settle(gameEnd);

    expect(playerService.addLocalSeasonPoints).not.toHaveBeenCalled();
    expect(dailyTaskService.recordGameEnd).not.toHaveBeenCalled();
  });

  it('matchCount <= 1 时拒绝', async () => {
    const { service, playerService } = createService({ 1: { matchCount: 1 } });
    const gameEnd = createGameEndDto();

    await service.settle(gameEnd);

    expect(playerService.addLocalSeasonPoints).not.toHaveBeenCalled();
  });

  it('多人比赛中只要有一人未通过检查，整场比赛都不结算、不记录每日任务', async () => {
    const { service, playerService, dailyTaskService } = createService({
      1: { matchCount: 20 },
      2: { matchCount: 1 }, // 这个玩家不满足 matchCount 门槛
    });
    const gameEnd = createGameEndDto({
      players: [createPlayerDto({ steamId: 1 }), createPlayerDto({ steamId: 2 })],
    });

    await service.settle(gameEnd);

    expect(playerService.addLocalSeasonPoints).not.toHaveBeenCalled();
    expect(dailyTaskService.recordGameEnd).not.toHaveBeenCalled();
  });

  it('20 分钟内重复结算（不同 matchId）拒绝', async () => {
    const { service, playerService } = createService();

    await service.settle(createGameEndDto({ matchId: 'match-1' }));
    await service.settle(createGameEndDto({ matchId: 'match-2' }));

    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledTimes(1);
  });

  it('同一 matchId 重试直接算失败，不重复加分', async () => {
    const { service, playerService } = createService();
    const gameEnd = createGameEndDto({ matchId: 'match-1' });

    await service.settle(gameEnd);
    await service.settle(gameEnd);

    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledTimes(1);
  });

  it('当日累计超过 1000 时整条拒绝，不部分发放', async () => {
    const { service, playerService } = createService();

    // 800 + 500 (clamp 后) = 1300 > 1000，第二次应被拒绝
    await service.settle(
      createGameEndDto({
        matchId: 'match-1',
        players: [createPlayerDto({ battlePoints: 800 })],
      }),
    );
    await service.settle(
      createGameEndDto({
        matchId: 'match-2',
        players: [createPlayerDto({ battlePoints: 800 })],
      }),
    );

    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledTimes(1);
  });
});
