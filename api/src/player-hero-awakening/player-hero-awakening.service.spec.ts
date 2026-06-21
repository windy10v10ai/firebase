import { BadRequestException } from '@nestjs/common';

import { PlayerHeroAwakeningService } from './player-hero-awakening.service';

describe('PlayerHeroAwakeningService', () => {
  const steamId = 123;
  const validHeroName = 'npc_dota_hero_axe';

  function createService(
    player: Record<string, number | undefined> | null,
    existingAwakenings: { heroName: string }[] = [],
  ) {
    const playerService = {
      findBySteamId: jest.fn().mockResolvedValue(player),
      upsertAddPoint: jest.fn().mockResolvedValue({}),
    };
    const playerHeroAwakeningRepository = {
      findById: jest.fn().mockResolvedValue(
        player ? { id: steamId.toString(), steamId, awakenings: existingAwakenings } : null,
      ),
      create: jest.fn().mockImplementation((doc) => Promise.resolve(doc)),
      update: jest.fn().mockImplementation((doc) => Promise.resolve(doc)),
    };
    const analyticsService = {
      playerUsePoint: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PlayerHeroAwakeningService(
      playerHeroAwakeningRepository as never,
      playerService as never,
      analyticsService as never,
    );
    return { service, playerService, playerHeroAwakeningRepository, analyticsService };
  }

  describe('awaken', () => {
    it('使用赛季可用积分觉醒：扣减 usedSeasonPoint，写入 usedSeasonPoint=10000，不写 usedMemberPoint', async () => {
      const { service, playerService, playerHeroAwakeningRepository, analyticsService } =
        createService({ seasonPointTotal: 10000, usedSeasonPoint: 0 });

      await service.awaken(steamId, validHeroName, false);

      expect(playerService.upsertAddPoint).toHaveBeenCalledWith(steamId, {
        usedSeasonPoint: 10000,
      });
      expect(analyticsService.playerUsePoint).toHaveBeenCalledWith(
        steamId,
        10000,
        false,
        'hero_awakening',
      );
      const savedDoc = playerHeroAwakeningRepository.update.mock.calls[0][0];
      expect(savedDoc.awakenings).toEqual([{ heroName: validHeroName, usedSeasonPoint: 10000 }]);
    });
  });
});
