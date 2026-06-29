import { PlayerHeroAwakeningCompensationService } from './player-hero-awakening-compensation.service';

describe('PlayerHeroAwakeningCompensationService', () => {
  function createService(
    docs: {
      id: string;
      steamId: number;
      awakenings: { heroName: string; usedSeasonPoint?: number; usedMemberPoint?: number }[];
    }[],
    players: Record<number, { usedSeasonPoint?: number; usedMemberPoint?: number }> = {},
  ) {
    let remaining = [...docs];
    let pendingLimit = remaining.length;
    const queryBuilder = {
      orderByAscending: jest.fn().mockReturnThis(),
      whereGreaterThan: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation((n: number) => {
        pendingLimit = n;
        return queryBuilder;
      }),
      find: jest.fn().mockImplementation(() => {
        const batch = remaining.slice(0, pendingLimit);
        remaining = remaining.slice(pendingLimit);
        return Promise.resolve(batch);
      }),
    };
    const playerHeroAwakeningRepository = {
      orderByAscending: jest.fn().mockReturnValue(queryBuilder),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const playerService = {
      reduceUsedPoint: jest.fn().mockImplementation((steamId: number, dto) => {
        const player = players[steamId] ?? {};
        if (dto.usedSeasonPoint) {
          player.usedSeasonPoint = Math.max(0, (player.usedSeasonPoint ?? 0) - dto.usedSeasonPoint);
        }
        if (dto.usedMemberPoint) {
          player.usedMemberPoint = Math.max(0, (player.usedMemberPoint ?? 0) - dto.usedMemberPoint);
        }
        players[steamId] = player;
        return Promise.resolve(player);
      }),
      findBySteamId: jest
        .fn()
        .mockImplementation((steamId: number) =>
          Promise.resolve({ id: steamId.toString(), ...(players[steamId] ?? {}) }),
        ),
    };
    const service = new PlayerHeroAwakeningCompensationService(
      playerHeroAwakeningRepository as never,
      playerService as never,
    );
    return { service, playerHeroAwakeningRepository, playerService };
  }

  it('对单个玩家：按 awakenings 实际花费求和退款，并删除 PlayerHeroAwakening 文档', async () => {
    const { service, playerHeroAwakeningRepository, playerService } = createService([
      {
        id: '100',
        steamId: 100,
        awakenings: [
          { heroName: 'npc_dota_hero_axe', usedSeasonPoint: 10000 },
          { heroName: 'npc_dota_hero_bane', usedSeasonPoint: 5000 },
        ],
      },
    ]);

    const result = await service.runCompensation(200);

    expect(playerService.reduceUsedPoint).toHaveBeenCalledWith(100, {
      usedSeasonPoint: 15000,
      usedMemberPoint: 0,
    });
    expect(playerHeroAwakeningRepository.delete).toHaveBeenCalledWith('100');
    expect(result.processedCount).toEqual(1);
  });

  it('混合季卡和会员积分花费：分别求和退款', async () => {
    const { service, playerService } = createService([
      {
        id: '200',
        steamId: 200,
        awakenings: [
          { heroName: 'npc_dota_hero_axe', usedSeasonPoint: 5000 },
          { heroName: 'npc_dota_hero_bane', usedMemberPoint: 2500 },
        ],
      },
    ]);

    await service.runCompensation(200);

    expect(playerService.reduceUsedPoint).toHaveBeenCalledWith(200, {
      usedSeasonPoint: 5000,
      usedMemberPoint: 2500,
    });
  });

  it('分批处理：超过单批大小时多次查询，全部处理完', async () => {
    const docs = Array.from({ length: 3 }, (_, i) => ({
      id: String(300 + i),
      steamId: 300 + i,
      awakenings: [{ heroName: 'npc_dota_hero_axe', usedSeasonPoint: 10000 }],
    }));
    const { service, playerHeroAwakeningRepository } = createService(docs);

    const result = await service.runCompensation(2);

    expect(result.processedCount).toEqual(3);
    expect(playerHeroAwakeningRepository.delete).toHaveBeenCalledTimes(3);
  });

  it('没有任何 PlayerHeroAwakening 文档时，processedCount 为 0，不报错', async () => {
    const { service } = createService([]);

    const result = await service.runCompensation(200);

    expect(result.processedCount).toEqual(0);
  });
});
