import { BadRequestException } from '@nestjs/common';

import { GameEndDto, GameEndPlayerDto } from '../analytics/dto/game-end-dto';
import { SERVER_TYPE } from '../util/secret/secret.service';

import { LocalRateLimit } from './entities/local-rate-limit.entity';
import { COOLDOWN_MS, LocalHostService } from './local-host.service';

const GAME_ID = 'game-id';

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
    playerCount: 1,
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
      upsertGameEnd: jest
        .fn()
        .mockImplementation((_id, _winner, points) => Promise.resolve(points)),
    };
    const dailyTaskService = {
      recordGameEnd: jest.fn().mockResolvedValue(undefined),
    };
    const bigQueryService = { recordGameEndAudit: jest.fn().mockResolvedValue(undefined) };
    const service = new LocalHostService(
      repository as never,
      playerService as never,
      dailyTaskService as never,
      bigQueryService as never,
    );
    return { service, store, playerService, dailyTaskService, bigQueryService };
  }

  it('合法请求：加分、记录每日任务', async () => {
    const { service, playerService, dailyTaskService } = createService();
    const gameEnd = createGameEndDto();

    await service.recordGameEnd(gameEnd, GAME_ID);

    expect(playerService.upsertGameEnd).toHaveBeenCalledWith(1, true, 200, false, false, GAME_ID);
    expect(dailyTaskService.recordGameEnd).toHaveBeenCalledWith(gameEnd.players);
  });

  it('steamId <= 0 的玩家跳过，不加分', async () => {
    const { service, playerService } = createService();
    const gameEnd = createGameEndDto({ players: [createPlayerDto({ steamId: 0 })] });

    await service.recordGameEnd(gameEnd, GAME_ID);

    expect(playerService.upsertGameEnd).not.toHaveBeenCalled();
  });

  it('玩家不存在时拒绝，不加分，也不记录每日任务', async () => {
    const { service, playerService, dailyTaskService } = createService({ 1: undefined });
    const gameEnd = createGameEndDto();

    await service.recordGameEnd(gameEnd, GAME_ID);

    expect(playerService.upsertGameEnd).not.toHaveBeenCalled();
    expect(dailyTaskService.recordGameEnd).not.toHaveBeenCalled();
  });

  it('多人比赛中只要有一人未通过检查，整场比赛都不结算、不记录每日任务', async () => {
    const { service, playerService, dailyTaskService } = createService({
      2: undefined, // 这个玩家不存在
    });
    const gameEnd = createGameEndDto({
      players: [createPlayerDto({ steamId: 1 }), createPlayerDto({ steamId: 2 })],
    });

    await service.recordGameEnd(gameEnd, GAME_ID);

    expect(playerService.upsertGameEnd).not.toHaveBeenCalled();
    expect(dailyTaskService.recordGameEnd).not.toHaveBeenCalled();
  });

  it('冷却窗口内重复结算（不同 matchId）拒绝', async () => {
    const { service, playerService } = createService();

    await service.recordGameEnd(createGameEndDto({ matchId: 'match-1' }), GAME_ID);
    await service.recordGameEnd(createGameEndDto({ matchId: 'match-2' }), GAME_ID);

    expect(playerService.upsertGameEnd).toHaveBeenCalledTimes(1);
  });

  it('控制台启动的对局 matchId 均为 "0"，过了冷却窗口后不应被当成重复而拒绝', async () => {
    jest.useFakeTimers();
    try {
      const { service, playerService } = createService();

      await service.recordGameEnd(createGameEndDto({ matchId: '0' }), GAME_ID);
      jest.advanceTimersByTime(COOLDOWN_MS + 1);
      await service.recordGameEnd(createGameEndDto({ matchId: '0' }), GAME_ID);

      expect(playerService.upsertGameEnd).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('当日额度用完后停止加分，继续记场次与任务', async () => {
    jest.useFakeTimers();
    try {
      const { service, playerService } = createService();

      for (let i = 0; i < 10; i++) {
        await service.recordGameEnd(
          createGameEndDto({
            matchId: `match-${i}`,
            players: [createPlayerDto({ battlePoints: 800 })],
          }),
          GAME_ID,
        );
        jest.advanceTimersByTime(COOLDOWN_MS + 1);
      }
      await service.recordGameEnd(
        createGameEndDto({
          matchId: 'match-10',
          players: [createPlayerDto({ battlePoints: 800 })],
        }),
        GAME_ID,
      );

      expect(playerService.upsertGameEnd).toHaveBeenCalledTimes(11);
      expect(playerService.upsertGameEnd).toHaveBeenLastCalledWith(
        1,
        true,
        0,
        false,
        false,
        GAME_ID,
      );
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
        dailyGameEndSeasonPoint: 1900,
        dailyUsedMemberPoint: 900,
        dailyCreatedOrderCount: 9,
      });

      await service.recordGameEnd(createGameEndDto(), GAME_ID);

      const saved = store.get('1');
      expect(saved?.dailyGameEndSeasonPoint).toBe(200);
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
        dailyGameEndSeasonPoint: 100,
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

      await service.recordGameEnd(gameEnd, GAME_ID);

      const saved = store.get('1');
      expect(saved?.dailyDate).toEqual(new Date('2026-09-02T00:00:00.000Z'));
      expect(saved?.dailyGameEndSeasonPoint).toBe(300);
    } finally {
      jest.useRealTimers();
    }
  });

  it('剩余额度部分发放，官方与本地入口共用冷却，保留原值审计', async () => {
    const { service, store, playerService, dailyTaskService, bigQueryService } = createService();
    store.set('1', { id: '1', dailyDate: getUtcMidnightForTest(), dailyGameEndSeasonPoint: 4800 });
    const gameEnd = createGameEndDto({
      playerCount: 4,
      players: [
        createPlayerDto({
          battlePoints: 20000000,
          dailyTask: { dayId: '20261021', taskId: 'kills', star: 1, seasonPoint: 100 },
        }),
      ],
    });
    const context = { gameId: GAME_ID, serverType: SERVER_TYPE.WINDY, route: 'official' as const };
    const result = await service.recordGameEnd(gameEnd, GAME_ID, { ip: '203.0.113.1' }, context);
    expect(result.recorded).toBe(true);
    expect(result.analyticsGameEnd.players[0].battlePoints).toBe(200);
    expect(result.analyticsGameEnd.players[0].dailyTask.seasonPoint).toBe(0);
    expect(dailyTaskService.recordGameEnd).toHaveBeenCalledWith(result.analyticsGameEnd.players);
    expect(gameEnd.players[0].battlePoints).toBe(20000000);
    expect(playerService.upsertGameEnd).toHaveBeenCalledWith(1, true, 200, false, true, GAME_ID);
    expect(store.get('1')?.dailyGameEndSeasonPoint).toBe(5000);
    expect(bigQueryService.recordGameEndAudit).toHaveBeenLastCalledWith(
      gameEnd,
      context,
      [
        expect.objectContaining({
          reasons: ['points_out_of_range', 'daily_cap'],
          awardedPoints: 200,
          accepted: true,
        }),
      ],
      { ip: '203.0.113.1' },
    );
    const rejected = await service.recordGameEnd(gameEnd, 'next-id');
    expect(rejected.recorded).toBe(false);
    expect(playerService.upsertGameEnd).toHaveBeenCalledTimes(1);
    expect(bigQueryService.recordGameEndAudit.mock.calls[1][2][0]).toMatchObject({
      reasons: ['points_out_of_range', 'cooldown'],
      awardedPoints: 0,
      accepted: false,
    });
  });

  describe('会员积分限额', () => {
    it('单笔超过 50 拒绝', async () => {
      const { service } = createService();

      await expect(service.checkMemberPointLimit(1, 51)).rejects.toThrow(BadRequestException);
    });

    it('单笔等于 50 通过', async () => {
      const { service } = createService();

      await expect(service.checkMemberPointLimit(1, 50)).resolves.toBe(true);
    });

    it('当日累计超过 2000 返回 false，不抛错', async () => {
      const { service, store } = createService();
      store.set('1', {
        id: '1',
        dailyDate: getUtcMidnightForTest(),
        dailyUsedMemberPoint: 1980,
      });

      await expect(service.checkMemberPointLimit(1, 50)).resolves.toBe(false);
    });

    it('记账累加当日消耗，不动其他计数', async () => {
      const { service, store } = createService();
      store.set('1', {
        id: '1',
        dailyDate: getUtcMidnightForTest(),
        dailyGameEndSeasonPoint: 300,
        dailyUsedMemberPoint: 100,
        dailyCreatedOrderCount: 2,
      });

      await service.recordMemberPointUsage(1, 20, 'lottery');

      const saved = store.get('1');
      expect(saved?.dailyUsedMemberPoint).toBe(120);
      expect(saved?.dailyGameEndSeasonPoint).toBe(300);
      expect(saved?.dailyCreatedOrderCount).toBe(2);
    });
  });

  describe('来源 IP 记录', () => {
    const origin = { ip: '203.0.113.5', country: 'JP' };
    const dayMs = 24 * 60 * 60 * 1000;

    function createIpActivity(count: number, lastAt: number) {
      return Array.from({ length: count }, (_, index) => ({
        ip: `198.51.100.${index}`,
        country: 'JP',
        gameEndCount: 1,
        gameEndSeasonPoint: 0,
        usedMemberPoint: 0,
        createdOrderCount: 0,
        firstAt: lastAt,
        lastAt,
      }));
    }

    it('结算累加次数与勇士积分，并记下国家', async () => {
      const { service, store } = createService();

      await service.recordGameEnd(createGameEndDto(), GAME_ID, origin);

      expect(store.get('1')?.ipActivity).toEqual([
        expect.objectContaining({
          ip: '203.0.113.5',
          country: 'JP',
          gameEndCount: 1,
          gameEndSeasonPoint: 200,
          usedMemberPoint: 0,
          createdOrderCount: 0,
        }),
      ]);
    });

    it('同一来源的消耗累加到同一条，不新增条目', async () => {
      const { service, store } = createService();

      await service.recordGameEnd(createGameEndDto(), GAME_ID, origin);
      await service.recordMemberPointUsage(1, 20, 'lottery', origin);

      const activity = store.get('1')?.ipActivity;
      expect(activity).toHaveLength(1);
      expect(activity?.[0]).toEqual(
        expect.objectContaining({ gameEndCount: 1, usedMemberPoint: 20 }),
      );
    });

    it('取不到来源地址时不记录', async () => {
      const { service, store } = createService();

      await service.recordMemberPointUsage(1, 20, 'lottery');

      expect(store.get('1')?.ipActivity).toBeUndefined();
    });

    it('写满后让出最久没更新的位置', async () => {
      const { service, store } = createService();
      const entries = createIpActivity(30, Date.now());
      entries[7] = { ...entries[7], ip: '198.51.100.99', lastAt: Date.now() - 31 * dayMs };
      store.set('1', { id: '1', ipActivity: entries });

      await service.recordMemberPointUsage(1, 20, 'lottery', origin);

      const activity = store.get('1')?.ipActivity;
      expect(activity).toHaveLength(30);
      expect(activity?.some((entry) => entry.ip === '198.51.100.99')).toBe(false);
      expect(activity?.find((entry) => entry.ip === '203.0.113.5')?.usedMemberPoint).toBe(20);
    });

    it('写满且全是近期来源时并进 other，金额不丢', async () => {
      const { service, store } = createService();
      store.set('1', { id: '1', ipActivity: createIpActivity(30, Date.now()) });

      await service.recordMemberPointUsage(1, 20, 'lottery', origin);

      const activity = store.get('1')?.ipActivity;
      expect(activity?.some((entry) => entry.ip === '203.0.113.5')).toBe(false);
      expect(activity?.find((entry) => entry.ip === 'other')?.usedMemberPoint).toBe(20);
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
