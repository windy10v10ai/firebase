import { Injectable } from '@nestjs/common';

import { MemberDto } from '../../members/dto/member.dto';
import { MembersService } from '../../members/members.service';
import { Player } from '../../player/entities/player.entity';
import { PlayerLevelHelper } from '../../player/helpers/player-level.helper';
import { PlayerGamePresetService } from '../../player/player-game-preset.service';
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
    private readonly playerGamePresetService: PlayerGamePresetService,
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
      dto.gamePreset = this.playerGamePresetService.extractPreset(playerSetting);
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
    const seasonPointTotal = dto.seasonPointTotal ?? 0;
    const memberPointTotal = dto.memberPointTotal ?? 0;

    const seasonLevel = PlayerLevelHelper.getSeasonLevelBuyPoint(seasonPointTotal);
    dto.seasonLevel = seasonLevel;
    dto.seasonCurrrentLevelPoint =
      seasonPointTotal - PlayerLevelHelper.getSeasonTotalPoint(seasonLevel);
    dto.seasonNextLevelPoint = PlayerLevelHelper.getSeasonNextLevelPoint(seasonLevel);

    const memberLevel = PlayerLevelHelper.getMemberLevelBuyPoint(memberPointTotal);
    dto.memberLevel = memberLevel;
    dto.memberCurrentLevelPoint =
      memberPointTotal - PlayerLevelHelper.getMemberTotalPoint(memberLevel);
    dto.memberNextLevelPoint = PlayerLevelHelper.getMemberNextLevelPoint(memberLevel);

    dto.totalLevel = seasonLevel + memberLevel;
  }

  private calculateUseableLevel(dto: PlayerInfoDto): number {
    return dto.totalLevel - (dto.usedLevel ?? 0);
  }

  private calculateUseablePoints(dto: PlayerInfoDto): void {
    dto.useableSeasonPoint = Math.max(0, (dto.seasonPointTotal ?? 0) - (dto.usedSeasonPoint ?? 0));
    dto.useableMemberPoint = Math.max(0, (dto.memberPointTotal ?? 0) - (dto.usedMemberPoint ?? 0));
  }
}
