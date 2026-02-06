import { Player } from '../entities/player.entity';

import { PlayerLevelHelper } from './player-level.helper';

describe('PlayerLevelHelper', () => {
  describe('getPlayerTotalLevel', () => {
    it('should return 0 when player is null', () => {
      expect(PlayerLevelHelper.getPlayerTotalLevel(null)).toBe(0);
    });

    it('should return 0 when player is undefined', () => {
      expect(PlayerLevelHelper.getPlayerTotalLevel(undefined as Player)).toBe(0);
    });

    it('should calculate total level correctly', () => {
      const player: Player = {
        id: '123',
        seasonPointTotal: 19000, // level 20
        memberPointTotal: 1000, // level 2
      } as Player;
      expect(PlayerLevelHelper.getPlayerTotalLevel(player)).toBe(22);
    });

    it('should handle zero points', () => {
      const player: Player = {
        id: '123',
        seasonPointTotal: 0,
        memberPointTotal: 0,
      } as Player;
      expect(PlayerLevelHelper.getPlayerTotalLevel(player)).toBe(2); // level 1 + level 1
    });
  });

  describe('勇士积分', () => {
    describe('升级所需积分', () => {
      it('1 -> 100', () => {
        expect(PlayerLevelHelper.getSeasonNextLevelPoint(1)).toBe(100);
      });

      it('2 -> 200', () => {
        expect(PlayerLevelHelper.getSeasonNextLevelPoint(2)).toBe(200);
      });

      it('20 -> 2000', () => {
        expect(PlayerLevelHelper.getSeasonNextLevelPoint(20)).toBe(2000);
      });

      it('50 -> 5000', () => {
        expect(PlayerLevelHelper.getSeasonNextLevelPoint(50)).toBe(5000);
      });
    });

    describe('等级所需累计积分', () => {
      it('1 -> 0', () => {
        expect(PlayerLevelHelper.getSeasonTotalPoint(1)).toBe(0);
      });

      it('2 -> 100', () => {
        expect(PlayerLevelHelper.getSeasonTotalPoint(2)).toBe(100);
      });

      it('3 -> 300', () => {
        expect(PlayerLevelHelper.getSeasonTotalPoint(3)).toBe(300);
      });

      it('20 -> 19000', () => {
        expect(PlayerLevelHelper.getSeasonTotalPoint(20)).toBe(19000);
      });

      it('50 -> 122500', () => {
        expect(PlayerLevelHelper.getSeasonTotalPoint(50)).toBe(122500);
      });
    });

    describe('根据积分获取当前等级', () => {
      it('0 -> 1', () => {
        expect(PlayerLevelHelper.getSeasonLevelBuyPoint(0)).toBe(1);
      });

      it('99 -> 1', () => {
        expect(PlayerLevelHelper.getSeasonLevelBuyPoint(99)).toBe(1);
      });

      it('100 -> 2', () => {
        expect(PlayerLevelHelper.getSeasonLevelBuyPoint(100)).toBe(2);
      });

      it('299 -> 2', () => {
        expect(PlayerLevelHelper.getSeasonLevelBuyPoint(299)).toBe(2);
      });

      it('300 -> 3', () => {
        expect(PlayerLevelHelper.getSeasonLevelBuyPoint(300)).toBe(3);
      });

      it('18999 -> 19', () => {
        expect(PlayerLevelHelper.getSeasonLevelBuyPoint(18999)).toBe(19);
      });

      it('19000 -> 20', () => {
        expect(PlayerLevelHelper.getSeasonLevelBuyPoint(19000)).toBe(20);
      });

      it('122499 -> 49', () => {
        expect(PlayerLevelHelper.getSeasonLevelBuyPoint(122499)).toBe(49);
      });

      it('122500 -> 50', () => {
        expect(PlayerLevelHelper.getSeasonLevelBuyPoint(122500)).toBe(50);
      });
    });
  });

  describe('会员积分', () => {
    describe('升级所需积分', () => {
      it('1 -> 1000', () => {
        expect(PlayerLevelHelper.getMemberNextLevelPoint(1)).toBe(1000);
      });

      it('2 -> 1050', () => {
        expect(PlayerLevelHelper.getMemberNextLevelPoint(2)).toBe(1050);
      });

      it('20 -> 1950', () => {
        expect(PlayerLevelHelper.getMemberNextLevelPoint(20)).toBe(1950);
      });

      it('50 -> 3450', () => {
        expect(PlayerLevelHelper.getMemberNextLevelPoint(50)).toBe(3450);
      });
    });

    describe('等级所需累计积分', () => {
      it('1 -> 0', () => {
        expect(PlayerLevelHelper.getMemberTotalPoint(1)).toBe(0);
      });

      it('2 -> 1000', () => {
        expect(PlayerLevelHelper.getMemberTotalPoint(2)).toBe(1000);
      });

      it('3 -> 2050', () => {
        expect(PlayerLevelHelper.getMemberTotalPoint(3)).toBe(2050);
      });

      it('21 -> 29500', () => {
        expect(PlayerLevelHelper.getMemberTotalPoint(21)).toBe(29500);
      });

      it('51 -> 111250', () => {
        expect(PlayerLevelHelper.getMemberTotalPoint(51)).toBe(111250);
      });
    });

    describe('根据积分获取当前等级', () => {
      it('0 -> 1', () => {
        expect(PlayerLevelHelper.getMemberLevelBuyPoint(0)).toBe(1);
      });

      it('999 -> 1', () => {
        expect(PlayerLevelHelper.getMemberLevelBuyPoint(999)).toBe(1);
      });

      it('1000 -> 2', () => {
        expect(PlayerLevelHelper.getMemberLevelBuyPoint(1000)).toBe(2);
      });

      it('1001 -> 2', () => {
        expect(PlayerLevelHelper.getMemberLevelBuyPoint(1001)).toBe(2);
      });

      it('2049 -> 2', () => {
        expect(PlayerLevelHelper.getMemberLevelBuyPoint(2049)).toBe(2);
      });

      it('2050 -> 3', () => {
        expect(PlayerLevelHelper.getMemberLevelBuyPoint(2050)).toBe(3);
      });

      it('29500 -> 21', () => {
        expect(PlayerLevelHelper.getMemberLevelBuyPoint(29500)).toBe(21);
      });

      it('111250 -> 51', () => {
        expect(PlayerLevelHelper.getMemberLevelBuyPoint(111250)).toBe(51);
      });
    });
  });

  describe('calculateUsedLevel', () => {
    it('should return 0 for empty array', () => {
      expect(PlayerLevelHelper.calculateUsedLevel([])).toBe(0);
    });

    it('should calculate used level correctly for single property', () => {
      const properties = [{ steamId: 123, name: 'property_cooldown_percentage', level: 5 }];
      expect(PlayerLevelHelper.calculateUsedLevel(properties)).toBe(5);
    });

    it('should calculate used level correctly for multiple properties', () => {
      const properties = [
        { steamId: 123, name: 'property_cooldown_percentage', level: 3 },
        { steamId: 123, name: 'property_movespeed_bonus_constant', level: 5 },
        { steamId: 123, name: 'property_skill_points_bonus', level: 2 },
      ];
      expect(PlayerLevelHelper.calculateUsedLevel(properties)).toBe(10);
    });

    it('should handle zero levels', () => {
      const properties = [
        { steamId: 123, name: 'property_cooldown_percentage', level: 0 },
        { steamId: 123, name: 'property_movespeed_bonus_constant', level: 5 },
        { steamId: 123, name: 'property_skill_points_bonus', level: 0 },
      ];
      expect(PlayerLevelHelper.calculateUsedLevel(properties)).toBe(5);
    });
  });
});
