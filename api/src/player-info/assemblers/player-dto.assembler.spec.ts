import { MembersService } from '../../members/members.service';
import { Player } from '../../player/entities/player.entity';
import { PlayerSettingService } from '../../player/player-setting.service';
import { PlayerStatsLifetimeService } from '../../player/player-stats-lifetime.service';
import { PlayerHeroAwakeningService } from '../../player-hero-awakening/player-hero-awakening.service';
import { PlayerPropertyService } from '../../player-property/player-property.service';

import { PlayerDtoAssembler } from './player-dto.assembler';

function makeAssembler(): PlayerDtoAssembler {
  return new PlayerDtoAssembler(
    { findBySteamId: jest.fn().mockResolvedValue([]) } as unknown as PlayerPropertyService,
    {
      getPlayerSettingOrGenerateDefault: jest.fn().mockResolvedValue({}),
    } as unknown as PlayerSettingService,
    { findOne: jest.fn().mockResolvedValue(null) } as unknown as MembersService,
    { findBySteamId: jest.fn().mockResolvedValue(null) } as unknown as PlayerStatsLifetimeService,
    { findBySteamId: jest.fn().mockResolvedValue([]) } as unknown as PlayerHeroAwakeningService,
  );
}

function makePlayer(override: Partial<Player>): Player {
  return {
    id: '123',
    matchCount: 0,
    winCount: 0,
    disconnectCount: 0,
    seasonPointTotal: 0,
    memberPointTotal: 0,
    usedSeasonPoint: 0,
    usedMemberPoint: 0,
    usedLevel: 0,
    conductPoint: 100,
    commendCount: 0,
    reportCount: 0,
    lastMatchTime: new Date(),
    ...override,
  } as Player;
}

describe('PlayerDtoAssembler', () => {
  let assembler: PlayerDtoAssembler;

  beforeEach(() => {
    assembler = makeAssembler();
  });

  describe('useableSeasonPoint / useableMemberPoint', () => {
    it('used point missing: full points available (零头 included)', async () => {
      // seasonLevel=3 (getSeasonTotalPoint(3)=300), 200-point 零头
      // memberLevel=1
      const dto = await assembler.assemblePlayerInfoDto(
        makePlayer({
          seasonPointTotal: 500,
          memberPointTotal: 100,
          usedLevel: 3,
          usedSeasonPoint: undefined,
          usedMemberPoint: undefined,
        }),
        [],
      );

      expect(dto.useableSeasonPoint).toBe(500);
      expect(dto.useableMemberPoint).toBe(100);
    });

    it('usedSeasonPoint reduces only season pool', async () => {
      const dto = await assembler.assemblePlayerInfoDto(
        makePlayer({
          seasonPointTotal: 300,
          memberPointTotal: 1000,
          usedLevel: 2,
          usedSeasonPoint: 120,
          usedMemberPoint: 0,
        }),
        [],
      );

      expect(dto.useableSeasonPoint).toBe(180);
      expect(dto.useableMemberPoint).toBe(1000);
    });

    it('usedMemberPoint reduces only member pool', async () => {
      const dto = await assembler.assemblePlayerInfoDto(
        makePlayer({
          seasonPointTotal: 300,
          memberPointTotal: 2050,
          usedLevel: 5,
          usedSeasonPoint: 0,
          usedMemberPoint: 450,
        }),
        [],
      );

      expect(dto.useableSeasonPoint).toBe(300);
      expect(dto.useableMemberPoint).toBe(1600);
    });

    it('used point above total clamps available points to 0', async () => {
      const dto = await assembler.assemblePlayerInfoDto(
        makePlayer({
          seasonPointTotal: 200,
          memberPointTotal: 500,
          usedSeasonPoint: 300,
          usedMemberPoint: 600,
        }),
        [],
      );

      expect(dto.useableSeasonPoint).toBe(0);
      expect(dto.useableMemberPoint).toBe(0);
    });
  });
});
