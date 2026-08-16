import { GameEndDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';

import { LocalSettlementRateLimit } from './entities/local-settlement-rate-limit.entity';
import { LocalSettlementService } from './local-settlement.service';

function createFakeRateLimitRepository() {
  const store = new Map<string, LocalSettlementRateLimit>();
  const transactionRepo = {
    findById: jest.fn((id: string) => Promise.resolve(store.get(id) ?? null)),
    update: jest.fn((doc: LocalSettlementRateLimit) => {
      store.set(doc.id, doc);
      return Promise.resolve(doc);
    }),
    create: jest.fn((doc: LocalSettlementRateLimit) => {
      store.set(doc.id, doc);
      return Promise.resolve(doc);
    }),
  };
  const repository = {
    runTransaction: jest.fn(
      (executor: (tran: typeof transactionRepo) => Promise<unknown>): Promise<unknown> =>
        executor(transactionRepo),
    ),
  };
  return { repository, store };
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

describe('LocalSettlementService', () => {
  function createService(existingPlayer: { matchCount: number } | null = { matchCount: 20 }) {
    const { repository, store } = createFakeRateLimitRepository();
    const playerService = {
      normalizeBattlePoints: jest.fn((points: number) => Math.min(500, Math.max(0, points))),
      findBySteamId: jest.fn().mockResolvedValue(existingPlayer),
      addLocalSeasonPoints: jest.fn().mockResolvedValue(undefined),
    };
    const dailyTaskService = {
      recordGameEnd: jest.fn().mockResolvedValue(undefined),
    };
    const service = new LocalSettlementService(
      repository as never,
      playerService as never,
      dailyTaskService as never,
    );
    return { service, store, playerService, dailyTaskService };
  }

  it('合法请求：加分、记录每日任务', async () => {
    const { service, playerService, dailyTaskService } = createService();
    const gameEnd = createGameEndDto();

    await service.settle(gameEnd, '1.2.3.4');

    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledWith(1, 200);
    expect(dailyTaskService.recordGameEnd).toHaveBeenCalledWith(gameEnd.players);
  });

  it('steamId <= 0 的玩家跳过，不加分', async () => {
    const { service, playerService } = createService();
    const gameEnd = createGameEndDto({ players: [createPlayerDto({ steamId: 0 })] });

    await service.settle(gameEnd, '1.2.3.4');

    expect(playerService.addLocalSeasonPoints).not.toHaveBeenCalled();
  });

  it('玩家不存在时拒绝，不加分', async () => {
    const { service, playerService } = createService(null);
    const gameEnd = createGameEndDto();

    await service.settle(gameEnd, '1.2.3.4');

    expect(playerService.addLocalSeasonPoints).not.toHaveBeenCalled();
  });

  it('matchCount 不足 10 时拒绝', async () => {
    const { service, playerService } = createService({ matchCount: 5 });
    const gameEnd = createGameEndDto();

    await service.settle(gameEnd, '1.2.3.4');

    expect(playerService.addLocalSeasonPoints).not.toHaveBeenCalled();
  });

  it('30 分钟内重复结算（不同 matchId）拒绝', async () => {
    const { service, playerService } = createService();

    await service.settle(createGameEndDto({ matchId: 'match-1' }), '1.2.3.4');
    await service.settle(createGameEndDto({ matchId: 'match-2' }), '5.6.7.8');

    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledTimes(1);
  });

  it('同一 matchId 重试视为幂等，不重复加分', async () => {
    const { service, playerService } = createService();
    const gameEnd = createGameEndDto({ matchId: 'match-1' });

    await service.settle(gameEnd, '1.2.3.4');
    await service.settle(gameEnd, '1.2.3.4');

    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledTimes(1);
  });

  it('当日累计超过 1000 时整条拒绝，不部分发放', async () => {
    const { service, playerService } = createService();
    playerService.normalizeBattlePoints.mockImplementation((points: number) =>
      Math.min(500, Math.max(0, points)),
    );

    // 800 + 500 (clamp 后) = 1300 > 1000，第二次应被拒绝
    await service.settle(
      createGameEndDto({
        matchId: 'match-1',
        players: [createPlayerDto({ battlePoints: 800 })],
      }),
      '1.2.3.4',
    );
    await service.settle(
      createGameEndDto({
        matchId: 'match-2',
        players: [createPlayerDto({ battlePoints: 800 })],
      }),
      '9.9.9.9',
    );

    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledTimes(1);
  });

  it('同一 IP 30 分钟内两个不同 matchId：第二次整体被拒，不处理任何玩家', async () => {
    const { service, playerService } = createService();

    await service.settle(createGameEndDto({ matchId: 'match-1' }), '1.2.3.4');
    await service.settle(
      createGameEndDto({
        matchId: 'match-2',
        players: [createPlayerDto({ steamId: 2 })],
      }),
      '1.2.3.4',
    );

    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledTimes(1);
    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledWith(1, 200);
  });

  it('同一 IP 同一 matchId 重试：不受 IP 限流影响', async () => {
    const { service, playerService } = createService();
    const gameEnd = createGameEndDto({ matchId: 'match-1' });

    await service.settle(gameEnd, '1.2.3.4');
    await service.settle(gameEnd, '1.2.3.4');

    // 两次都放行到玩家层（不会被 IP 限流拦在外面）；第二次命中幂等，
    // 在读到 lastRequestMatchId 相同后直接短路，不会再读 Player、也不重复加分。
    expect(playerService.findBySteamId).toHaveBeenCalledTimes(1);
    expect(playerService.addLocalSeasonPoints).toHaveBeenCalledTimes(1);
  });
});
