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
      findById: jest
        .fn()
        .mockResolvedValue(
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

    it('使用会员可用积分觉醒：扣减 usedMemberPoint=5000，不写 usedSeasonPoint', async () => {
      const { service, playerService, playerHeroAwakeningRepository, analyticsService } =
        createService({ memberPointTotal: 5000, usedMemberPoint: 0 });

      await service.awaken(steamId, validHeroName, true);

      expect(playerService.upsertAddPoint).toHaveBeenCalledWith(steamId, {
        usedMemberPoint: 5000,
      });
      expect(analyticsService.playerUsePoint).toHaveBeenCalledWith(
        steamId,
        5000,
        true,
        'hero_awakening',
      );
      const savedDoc = playerHeroAwakeningRepository.update.mock.calls[0][0];
      expect(savedDoc.awakenings).toEqual([{ heroName: validHeroName, usedMemberPoint: 5000 }]);
    });

    it('赛季可用积分不足应报错，不扣分不写入', async () => {
      const { service, playerService, playerHeroAwakeningRepository } = createService({
        seasonPointTotal: 10000,
        usedSeasonPoint: 1,
      });

      await expect(service.awaken(steamId, validHeroName, false)).rejects.toThrow(
        BadRequestException,
      );
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
      expect(playerHeroAwakeningRepository.update).not.toHaveBeenCalled();
    });

    it('会员可用积分不足应报错', async () => {
      const { service, playerService } = createService({
        memberPointTotal: 5000,
        usedMemberPoint: 1,
      });

      await expect(service.awaken(steamId, validHeroName, true)).rejects.toThrow(
        BadRequestException,
      );
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
    });

    it('无效英雄名应报错', async () => {
      const { service, playerService } = createService({ seasonPointTotal: 10000 });

      await expect(service.awaken(steamId, 'npc_dota_hero_not_a_real_hero', false)).rejects.toThrow(
        BadRequestException,
      );
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
    });

    it('玩家不存在应报错', async () => {
      const { service } = createService(null);

      await expect(service.awaken(steamId, validHeroName, false)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('重复觉醒同一英雄应报错', async () => {
      const { service, playerService } = createService(
        { seasonPointTotal: 20000, usedSeasonPoint: 0 },
        [{ heroName: validHeroName }],
      );

      await expect(service.awaken(steamId, validHeroName, false)).rejects.toThrow(
        BadRequestException,
      );
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
    });
  });
});
