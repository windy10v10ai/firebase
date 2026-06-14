import { BadRequestException } from '@nestjs/common';

import { PlayerPropertyService } from './player-property.service';

describe('PlayerPropertyService', () => {
  describe('validatePropertyName', () => {
    it('should accept slow immune property', () => {
      const service = new PlayerPropertyService({} as never, {} as never, {} as never);

      expect(() => service.validatePropertyName('property_slow_immune')).not.toThrow();
    });
  });

  describe('calculateUsedLevel', () => {
    it('should return 0 for empty array', () => {
      expect(PlayerPropertyService.calculateUsedLevel([])).toBe(0);
    });

    it('should calculate used level correctly for single property', () => {
      const properties = [{ steamId: 123, name: 'property_cooldown_percentage', level: 5 }];
      expect(PlayerPropertyService.calculateUsedLevel(properties)).toBe(5);
    });

    it('should calculate used level correctly for multiple properties', () => {
      const properties = [
        { steamId: 123, name: 'property_cooldown_percentage', level: 3 },
        { steamId: 123, name: 'property_movespeed_bonus_constant', level: 5 },
        { steamId: 123, name: 'property_skill_points_bonus', level: 2 },
      ];
      expect(PlayerPropertyService.calculateUsedLevel(properties)).toBe(10);
    });

    it('should handle zero levels', () => {
      const properties = [
        { steamId: 123, name: 'property_cooldown_percentage', level: 0 },
        { steamId: 123, name: 'property_movespeed_bonus_constant', level: 5 },
        { steamId: 123, name: 'property_skill_points_bonus', level: 0 },
      ];
      expect(PlayerPropertyService.calculateUsedLevel(properties)).toBe(5);
    });
  });

  describe('reset', () => {
    const steamId = 123;

    function createService(player: Record<string, number | undefined>) {
      const playerService = {
        findBySteamId: jest.fn().mockResolvedValue(player),
        upsertAddPoint: jest.fn().mockResolvedValue({}),
        setUsedLevel: jest.fn().mockResolvedValue({}),
      };
      const playerPropertyRepository = {
        delete: jest.fn().mockResolvedValue({}),
      };
      const analyticsService = {
        playerUsePoint: jest.fn().mockResolvedValue(undefined),
      };
      const service = new PlayerPropertyService(
        playerPropertyRepository as never,
        playerService as never,
        analyticsService as never,
      );
      return { service, playerService, playerPropertyRepository, analyticsService };
    }

    it('使用会员可用积分重置：扣减 usedMemberPoint，不改变 memberPointTotal', async () => {
      const { service, playerService, analyticsService } = createService({
        memberPointTotal: 1000,
        usedMemberPoint: 0,
      });

      await service.reset(steamId, true);

      expect(playerService.upsertAddPoint).toHaveBeenCalledWith(steamId, {
        usedMemberPoint: 1000,
      });
      expect(analyticsService.playerUsePoint).toHaveBeenCalledWith(
        steamId,
        1000,
        true,
        'reset_property',
      );
    });

    it('使用会员积分重置：总积分充足但可用积分不足应报错', async () => {
      const { service, playerService } = createService({
        memberPointTotal: 1000,
        usedMemberPoint: 1,
      });

      await expect(service.reset(steamId, true)).rejects.toThrow(BadRequestException);
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
    });

    it('使用赛季可用积分重置：扣减 usedSeasonPoint，不改变 seasonPointTotal', async () => {
      const { service, playerService, analyticsService } = createService({
        seasonPointTotal: 200,
        usedSeasonPoint: 0,
      });

      await service.reset(steamId, false);

      expect(playerService.upsertAddPoint).toHaveBeenCalledWith(steamId, {
        usedSeasonPoint: 200,
      });
      expect(analyticsService.playerUsePoint).toHaveBeenCalledWith(
        steamId,
        200,
        false,
        'reset_property',
      );
    });

    it('使用赛季积分重置：总积分充足但可用积分不足应报错', async () => {
      const { service, playerService } = createService({
        seasonPointTotal: 200,
        usedSeasonPoint: 1,
      });

      await expect(service.reset(steamId, false)).rejects.toThrow(BadRequestException);
      expect(playerService.upsertAddPoint).not.toHaveBeenCalled();
    });

    it('玩家不存在应报错', async () => {
      const { service, playerService } = createService(null as never);
      playerService.findBySteamId.mockResolvedValue(null);

      await expect(service.reset(steamId, true)).rejects.toThrow(BadRequestException);
    });
  });
});
