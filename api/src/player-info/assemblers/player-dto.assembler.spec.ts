import { MembersService } from '../../members/members.service';
import { Player } from '../../player/entities/player.entity';
import { PlayerSettingService } from '../../player/player-setting.service';
import { PlayerStatsLifetimeService } from '../../player/player-stats-lifetime.service';
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
    it('usedLevel=0: full points available (零头 included)', async () => {
      // seasonLevel=3 (getSeasonTotalPoint(3)=300), 200-point 零头
      // memberLevel=1
      const dto = await assembler.assemblePlayerInfoDto(
        makePlayer({ seasonPointTotal: 500, memberPointTotal: 100, usedLevel: 0 }),
        [],
      );

      expect(dto.useableSeasonPoint).toBe(500);
      expect(dto.useableMemberPoint).toBe(100);
    });

    it('优先勇士分配: usedLevel within seasonLevel uses only season pool', async () => {
      // seasonLevel=3, usedLevel=2 → usedSeasonLevel=2, usedMemberLevel=0
      // getSeasonTotalPoint(2) = 100
      const dto = await assembler.assemblePlayerInfoDto(
        makePlayer({ seasonPointTotal: 300, memberPointTotal: 0, usedLevel: 2 }),
        [],
      );

      expect(dto.useableSeasonPoint).toBe(200); // 300 - 100
      expect(dto.useableMemberPoint).toBe(0); // 0 - getMemberTotalPoint(1)=0
    });

    it('usedLevel crosses into member pool', async () => {
      // seasonLevel=3 (getSeasonTotalPoint(3)=300), memberLevel=3 (getMemberTotalPoint(3)=2050)
      // usedLevel=5 → usedSeasonLevel=3, usedMemberLevel=2
      // getMemberTotalPoint(2)=1000
      const dto = await assembler.assemblePlayerInfoDto(
        makePlayer({ seasonPointTotal: 300, memberPointTotal: 2050, usedLevel: 5 }),
        [],
      );

      expect(dto.useableSeasonPoint).toBe(0); // 300 - 300
      expect(dto.useableMemberPoint).toBe(1050); // 2050 - 1000
    });

    it('勇士升级波动: useableSeasonPoint decreases, useableMemberPoint increases', async () => {
      // Before level up: seasonLevel=2 (getSeasonTotalPoint(2)=100), usedLevel=4
      //   usedSeasonLevel=2, usedMemberLevel=2
      //   useableSeasonPoint = 200-100 = 100
      //   useableMemberPoint = 2050-getMemberTotalPoint(2)=2050-1000 = 1050
      const dtoBefore = await assembler.assemblePlayerInfoDto(
        makePlayer({ seasonPointTotal: 200, memberPointTotal: 2050, usedLevel: 4 }),
        [],
      );
      expect(dtoBefore.useableSeasonPoint).toBe(100);
      expect(dtoBefore.useableMemberPoint).toBe(1050);

      // After level up: seasonLevel=3 (350 points, getSeasonTotalPoint(3)=300), usedLevel=4
      //   usedSeasonLevel=3, usedMemberLevel=1 → getMemberTotalPoint(1)=0
      //   useableSeasonPoint = 350-300 = 50 (decreased)
      //   useableMemberPoint = 2050-0 = 2050 (increased)
      const dtoAfter = await assembler.assemblePlayerInfoDto(
        makePlayer({ seasonPointTotal: 350, memberPointTotal: 2050, usedLevel: 4 }),
        [],
      );
      expect(dtoAfter.useableSeasonPoint).toBe(50);
      expect(dtoAfter.useableMemberPoint).toBe(2050);
    });
  });
});
