import { BadRequestException } from '@nestjs/common';

import { GameEndDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';

import { LocalRateLimit } from './entities/local-rate-limit.entity';
import { COOLDOWN_MS, LocalHostService } from './local-host.service';

function getUtcMidnightForTest(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

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
      upsertLocalGameEnd: jest.fn().mockResolvedValue(undefined),
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

    expect(playerService.upsertLocalGameEnd).toHaveBeenCalledWith(1, true, 200, false);
    expect(dailyTaskService.recordGameEnd).toHaveBeenCalledWith(gameEnd.players);
  });

  it('steamId <= 0 的玩家跳过，不加分', async () => {
    const { service, playerService } = createService();
    const gameEnd = createGameEndDto({ players: [createPlayerDto({ steamId: 0 })] });

    await service.settle(gameEnd);

    expect(playerService.upsertLocalGameEnd).not.toHaveBeenCalled();
  });

  it('玩家不存在时拒绝，不加分，也不记录每日任务', async () => {
    const { service, playerService, dailyTaskService } = createService({ 1: undefined });
    const gameEnd = createGameEndDto();

    await service.settle(gameEnd);

    expect(playerService.upsertLocalGameEnd).not.toHaveBeenCalled();
    expect(dailyTaskService.recordGameEnd).not.toHaveBeenCalled();
  });

  it('多人比赛中只要有一人未通过检查，整场比赛都不结算、不记录每日任务', async () => {
    const { service, playerService, dailyTaskService } = createService({
      2: undefined, // 这个玩家不存在
    });
    const gameEnd = createGameEndDto({
      players: [createPlayerDto({ steamId: 1 }), createPlayerDto({ steamId: 2 })],
    });

    await service.settle(gameEnd);

    expect(playerService.upsertLocalGameEnd).not.toHaveBeenCalled();
    expect(dailyTaskService.recordGameEnd).not.toHaveBeenCalled();
  });

  it('20 分钟内重复结算（不同 matchId）拒绝', async () => {
    const { service, playerService } = createService();

    await service.settle(createGameEndDto({ matchId: 'match-1' }));
    await service.settle(createGameEndDto({ matchId: 'match-2' }));

    expect(playerService.upsertLocalGameEnd).toHaveBeenCalledTimes(1);
  });

  it('控制台启动的对局 matchId 均为 "0"，过了冷却窗口后不应被当成重复而拒绝', async () => {
    jest.useFakeTimers();
    try {
      const { service, playerService } = createService();

      await service.settle(createGameEndDto({ matchId: '0' }));
      jest.advanceTimersByTime(COOLDOWN_MS + 1);
      await service.settle(createGameEndDto({ matchId: '0' }));

      expect(playerService.upsertLocalGameEnd).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('当日累计超过 2000 时整条拒绝，不部分发放', async () => {
    jest.useFakeTimers();
    try {
      const { service, playerService } = createService();

      // 单局 battlePoints 会被 clamp 到 500，连续 4 局刚好打到 2000 上限
      // （均不拒绝），第 5 局再 + 500 = 2500 > 2000，应被拒绝。
      for (let i = 0; i < 4; i++) {
        await service.settle(
          createGameEndDto({
            matchId: `match-${i}`,
            players: [createPlayerDto({ battlePoints: 800 })],
          }),
        );
        jest.advanceTimersByTime(COOLDOWN_MS + 1);
      }
      await service.settle(
        createGameEndDto({
          matchId: 'match-4',
          players: [createPlayerDto({ battlePoints: 800 })],
        }),
      );

      expect(playerService.upsertLocalGameEnd).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it('跨日结算时三个当日计数一起归零', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-02T03:00:00.000Z'));
      const { service, store } = createService();
      store.set('1', {
        id: '1',
        dailyDate: new Date('2026-09-01T00:00:00.000Z'),
        dailyEarnedSeasonPoint: 1900,
        dailyUsedMemberPoint: 900,
        dailyCreatedOrderCount: 9,
      });

      await service.settle(createGameEndDto());

      const saved = store.get('1');
      expect(saved?.dailyEarnedSeasonPoint).toBe(200);
      expect(saved?.dailyUsedMemberPoint).toBe(0);
      expect(saved?.dailyCreatedOrderCount).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('多人结算中途跨过 UTC 零点，写回的 dailyDate 与 counters 仍是 check 那天的', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-09-02T23:59:00.000Z'));
      const { service, store, playerService } = createService();
      store.set('1', {
        id: '1',
        dailyDate: new Date('2026-09-02T00:00:00.000Z'),
        dailyEarnedSeasonPoint: 100,
        dailyUsedMemberPoint: 0,
        dailyCreatedOrderCount: 0,
      });

      // 第二个玩家的 check 完成时，把时钟推过 UTC 零点，模拟「先查完所有玩家
      // 再统一写回」这段时间跨天：第一个玩家的 commit 应写 check 时算出的
      // 那一天，而不是写回那一刻的新日期
      let findBySteamIdCallCount = 0;
      playerService.findBySteamId.mockImplementation(() => {
        findBySteamIdCallCount += 1;
        if (findBySteamIdCallCount === 2) {
          jest.setSystemTime(new Date('2026-09-03T00:00:30.000Z'));
        }
        return Promise.resolve({ matchCount: 20 });
      });

      const gameEnd = createGameEndDto({
        players: [
          createPlayerDto({ steamId: 1, battlePoints: 200 }),
          createPlayerDto({ steamId: 2, battlePoints: 150 }),
        ],
      });

      await service.settle(gameEnd);

      const saved = store.get('1');
      expect(saved?.dailyDate).toEqual(new Date('2026-09-02T00:00:00.000Z'));
      expect(saved?.dailyEarnedSeasonPoint).toBe(300);
    } finally {
      jest.useRealTimers();
    }
  });

  describe('会员积分限额', () => {
    it('单笔超过 50 拒绝', async () => {
      const { service } = createService();

      await expect(service.assertMemberPointWithinLimit(1, 51)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('单笔等于 50 通过', async () => {
      const { service } = createService();

      await expect(service.assertMemberPointWithinLimit(1, 50)).resolves.toBeUndefined();
    });

    it('当日累计超过 1000 拒绝', async () => {
      const { service, store } = createService();
      store.set('1', {
        id: '1',
        dailyDate: getUtcMidnightForTest(),
        dailyUsedMemberPoint: 980,
      });

      await expect(service.assertMemberPointWithinLimit(1, 50)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('记账累加当日消耗，不动其他计数', async () => {
      const { service, store } = createService();
      store.set('1', {
        id: '1',
        dailyDate: getUtcMidnightForTest(),
        dailyEarnedSeasonPoint: 300,
        dailyUsedMemberPoint: 100,
        dailyCreatedOrderCount: 2,
      });

      await service.recordMemberPointUsage(1, 20, 'lottery');

      const saved = store.get('1');
      expect(saved?.dailyUsedMemberPoint).toBe(120);
      expect(saved?.dailyEarnedSeasonPoint).toBe(300);
      expect(saved?.dailyCreatedOrderCount).toBe(2);
    });
  });

  describe('支付宝下单限流', () => {
    it('当日第 11 次下单被拒', async () => {
      const { service, store } = createService();
      store.set('1', { id: '1', dailyDate: getUtcMidnightForTest(), dailyCreatedOrderCount: 10 });

      await expect(service.assertOrderWithinLimit(1)).rejects.toThrow(BadRequestException);
    });

    it('当日第 10 次下单通过', async () => {
      const { service, store } = createService();
      store.set('1', { id: '1', dailyDate: getUtcMidnightForTest(), dailyCreatedOrderCount: 9 });

      await expect(service.assertOrderWithinLimit(1)).resolves.toBeUndefined();
    });

    it('记账累加下单次数', async () => {
      const { service, store } = createService();

      await service.recordOrder(1);

      expect(store.get('1')?.dailyCreatedOrderCount).toBe(1);
    });

    it('支付成功清零下单次数，不动积分计数', async () => {
      const { service, store } = createService();
      store.set('1', {
        id: '1',
        dailyDate: getUtcMidnightForTest(),
        dailyUsedMemberPoint: 100,
        dailyCreatedOrderCount: 10,
      });

      await service.resetOrderCount(1);

      const saved = store.get('1');
      expect(saved?.dailyCreatedOrderCount).toBe(0);
      expect(saved?.dailyUsedMemberPoint).toBe(100);
    });

    it('没有限流记录时清零是空操作', async () => {
      const { service, store } = createService();

      await service.resetOrderCount(1);

      expect(store.get('1')).toBeUndefined();
    });
  });
});
