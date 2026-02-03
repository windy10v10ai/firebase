import { Injectable } from '@nestjs/common';

import { PlayerDto } from '../../player/dto/player.dto';
import { Player } from '../../player/entities/player.entity';
import { PlayerLevelHelper } from '../../player/helpers/player-level.helper';
import { PlayerSettingService } from '../../player/player-setting.service';
import { PlayerPropertyService } from '../../player-property/player-property.service';

/**
 * PlayerDtoAssembler - Assembler 模式
 * 负责组装 Player 对象为 PlayerDto，包含数据获取和计算逻辑
 */
@Injectable()
export class PlayerDtoAssembler {
  constructor(
    private readonly playerPropertyService: PlayerPropertyService,
    private readonly playerSettingService: PlayerSettingService,
  ) {}

  /**
   * 组装 Player 对象为 PlayerDto
   * @param player Player 实体对象
   * @returns 组装后的 PlayerDto
   */
  async assemblePlayerDto(player: Player): Promise<PlayerDto> {
    const dto = player as PlayerDto;

    // 获取属性
    const properties = await this.playerPropertyService.findBySteamId(+player.id);
    dto.properties = properties || [];

    // 获取设置
    dto.playerSetting = await this.playerSettingService.getPlayerSettingOrGenerateDefault(
      player.id,
    );

    // 计算等级相关数据（使用 PlayerLevelHelper）
    this.calculateLevelData(dto);

    // 计算可用等级
    dto.useableLevel = this.calculateUseableLevel(dto);

    return dto;
  }

  /**
   * 计算等级相关数据
   * @param dto PlayerDto 对象
   */
  private calculateLevelData(dto: PlayerDto): void {
    // 使用 PlayerLevelHelper 进行计算
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

  /**
   * 计算可用等级
   * @param dto PlayerDto 对象
   * @returns 可用等级
   */
  private calculateUseableLevel(dto: PlayerDto): number {
    const usedLevel = PlayerLevelHelper.calculateUsedLevel(dto.properties);
    return dto.totalLevel - usedLevel;
  }
}
