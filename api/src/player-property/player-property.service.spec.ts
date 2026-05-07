import { PlayerPropertyService } from './player-property.service';

describe('PlayerPropertyService', () => {
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
});
