import { PlayerHeroAwakeningSeasonPointPriceAdjustmentService } from './player-hero-awakening-season-point-price-adjustment.service';

describe('PlayerHeroAwakeningSeasonPointPriceAdjustmentService', () => {
  function createService(
    docs: {
      id: string;
      steamId: number;
      awakenings: { heroName: string; usedSeasonPoint?: number; usedMemberPoint?: number }[];
    }[],
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
      update: jest.fn().mockResolvedValue(undefined),
    };
    const playerService = {
      reduceUsedPoint: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PlayerHeroAwakeningSeasonPointPriceAdjustmentService(
      playerHeroAwakeningRepository as never,
      playerService as never,
    );
    return { service, playerHeroAwakeningRepository, playerService };
  }

  it('退还旧赛季积分价格差额，并保留觉醒状态和会员积分记录', async () => {
    const docs = [
      {
        id: '100',
        steamId: 100,
        awakenings: [
          { heroName: 'npc_dota_hero_axe', usedSeasonPoint: 10000 },
          { heroName: 'npc_dota_hero_bane', usedSeasonPoint: 5000 },
          { heroName: 'npc_dota_hero_lina', usedMemberPoint: 4000 },
        ],
      },
    ];
    const { service, playerHeroAwakeningRepository, playerService } = createService(docs);

    const result = await service.runPriceAdjustment();

    expect(playerService.reduceUsedPoint).toHaveBeenCalledWith(100, {
      usedSeasonPoint: 3000,
      usedMemberPoint: 0,
    });
    expect(playerHeroAwakeningRepository.update).toHaveBeenCalledWith({
      id: '100',
      steamId: 100,
      awakenings: [
        { heroName: 'npc_dota_hero_axe', usedSeasonPoint: 8000 },
        { heroName: 'npc_dota_hero_bane', usedSeasonPoint: 4000 },
        { heroName: 'npc_dota_hero_lina', usedMemberPoint: 4000 },
      ],
    });
    expect(result).toEqual({ processedCount: 1, totalRefundSeasonPoint: 3000 });
  });

  it('已按新价格记录的觉醒不退款，重复调用不会二次退款', async () => {
    const { service, playerHeroAwakeningRepository, playerService } = createService([
      {
        id: '200',
        steamId: 200,
        awakenings: [
          { heroName: 'npc_dota_hero_axe', usedSeasonPoint: 8000 },
          { heroName: 'npc_dota_hero_bane', usedSeasonPoint: 4000 },
        ],
      },
    ]);

    const result = await service.runPriceAdjustment();

    expect(playerService.reduceUsedPoint).not.toHaveBeenCalled();
    expect(playerHeroAwakeningRepository.update).not.toHaveBeenCalled();
    expect(result).toEqual({ processedCount: 0, totalRefundSeasonPoint: 0 });
  });
});
