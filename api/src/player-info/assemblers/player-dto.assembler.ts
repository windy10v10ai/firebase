import { Injectable } from '@nestjs/common';

import { MemberDto } from '../../members/dto/member.dto';
import { MembersService } from '../../members/members.service';
import { Player } from '../../player/entities/player.entity';
import { PlayerLevelHelper } from '../../player/helpers/player-level.helper';
import { PlayerSettingService } from '../../player/player-setting.service';
import { PlayerStatsLifetimeService } from '../../player/player-stats-lifetime.service';
import { PlayerPropertyService } from '../../player-property/player-property.service';
import { PlayerInfoDto } from '../dto/player-info.dto';

export type PlayerInfoInclude = 'member' | 'property' | 'setting' | 'statsLifetime';

@Injectable()
export class PlayerDtoAssembler {
  constructor(
    private readonly playerPropertyService: PlayerPropertyService,
    private readonly playerSettingService: PlayerSettingService,
    private readonly membersService: MembersService,
    private readonly playerStatsLifetimeService: PlayerStatsLifetimeService,
  ) {}

  async assemblePlayerInfoDto(
    player: Player,
    include: PlayerInfoInclude[],
  ): Promise<PlayerInfoDto> {
    const dto = player as PlayerInfoDto;

    this.calculateLevelData(dto);
    dto.useableLevel = this.calculateUseableLevel(dto);
    this.calculateUseablePoints(dto);

    const [properties, playerSetting, member, statsLifetime] = await Promise.all([
      include.includes('property') ? this.playerPropertyService.findBySteamId(+player.id) : null,
      include.includes('setting')
        ? this.playerSettingService.getPlayerSettingOrGenerateDefault(player.id)
        : null,
      include.includes('member') ? this.membersService.findOne(+player.id) : null,
      include.includes('statsLifetime')
        ? this.playerStatsLifetimeService.findBySteamId(+player.id)
        : null,
    ]);

    if (include.includes('property')) {
      dto.properties = properties ?? [];
    }
    if (include.includes('setting')) {
      dto.playerSetting = playerSetting;
    }
    if (include.includes('member') && member) {
      dto.member = new MemberDto(member);
    }
    if (include.includes('statsLifetime')) {
      dto.statsLifetime = statsLifetime ?? undefined;
    }

    return dto;
  }

  private calculateLevelData(dto: PlayerInfoDto): void {
    const seasonLevel = PlayerLevelHelper.getSeasonLevelBuyPoint(dto.seasonPointTotal);
    dto.seasonLevel = seasonLevel;
    dto.seasonCurrrentLevelPoint =
      dto.seasonPointTotal - PlayerLevelHelper.getSeasonTotalPoint(seasonLevel);
    dto.seasonNextLevelPoint = PlayerLevelHelper.getSeasonNextLevelPoint(seasonLevel);

    const memberLevel = PlayerLevelHelper.getMemberLevelBuyPoint(dto.memberPointTotal);
    dto.memberLevel = memberLevel;
    dto.memberCurrentLevelPoint =
      dto.memberPointTotal - PlayerLevelHelper.getMemberTotalPoint(memberLevel);
    dto.memberNextLevelPoint = PlayerLevelHelper.getMemberNextLevelPoint(memberLevel);

    dto.totalLevel = seasonLevel + memberLevel;
  }

  private calculateUseableLevel(dto: PlayerInfoDto): number {
    return dto.totalLevel - (dto.usedLevel ?? 0);
  }

  private calculateUseablePoints(dto: PlayerInfoDto): void {
    const usedLevel = dto.usedLevel ?? 0;
    const usedSeasonLevel = Math.min(usedLevel, dto.seasonLevel);
    const usedMemberLevel = usedLevel - usedSeasonLevel;

    dto.useableSeasonPoint =
      dto.seasonPointTotal - PlayerLevelHelper.getSeasonTotalPoint(usedSeasonLevel);
    dto.useableMemberPoint =
      dto.memberPointTotal - PlayerLevelHelper.getMemberTotalPoint(usedMemberLevel);
  }
}
