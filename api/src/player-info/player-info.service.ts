import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';

import { PlayerDto } from '../player/dto/player.dto';
import { PlayerSettingService } from '../player/player-setting.service';
import { PlayerService } from '../player/player.service';
import { UpdatePlayerPropertyDto } from '../player-property/dto/update-player-property.dto';
import { PlayerPropertyService } from '../player-property/player-property.service';

@Injectable()
export class PlayerInfoService {
  private readonly resetPlayerPropertyMemberPoint = 1000;

  constructor(
    private readonly playerService: PlayerService,
    private readonly playerPropertyService: PlayerPropertyService,
    private readonly playerSettingService: PlayerSettingService,
  ) {}

  /**
   * 根据 Steam ID 查找单个 PlayerDto
   * @param steamId Steam ID
   * @returns PlayerDto
   */
  async findPlayerDtoBySteamId(steamId: number): Promise<PlayerDto> {
    const players = await this.findPlayerDtoBySteamIds([steamId.toString()]);
    return players[0];
  }

  /**
   * 根据 Steam ID 列表查找多个 PlayerDto
   * @deprecated 此方法将在未来版本中移除，请使用 findPlayerInfoBySteamIds 替代
   * @param ids Steam ID 字符串数组
   * @returns PlayerDto 数组
   */
  async findPlayerDtoBySteamIds(ids: string[]): Promise<PlayerDto[]> {
    const players = (await this.playerService.findByIds(ids)) as PlayerDto[];
    for (const player of players) {
      // 获取玩家属性
      const properties = await this.playerPropertyService.findBySteamId(+player.id);
      if (properties) {
        player.properties = properties;
      } else {
        player.properties = [];
      }

      // 获取玩家设置
      const setting = await this.playerSettingService.getPlayerSettingOrGenerateDefault(player.id);
      player.playerSetting = setting;

      // 计算赛季等级相关数据
      const seasonPoint = player.seasonPointTotal;
      const seasonLevel = this.playerService.getSeasonLevelBuyPoint(seasonPoint);
      player.seasonLevel = seasonLevel;
      player.seasonCurrrentLevelPoint =
        seasonPoint - this.playerService.getSeasonTotalPoint(seasonLevel);
      player.seasonNextLevelPoint = this.playerService.getSeasonNextLevelPoint(seasonLevel);

      // 计算会员等级相关数据
      const memberPoint = player.memberPointTotal;
      const memberLevel = this.playerService.getMemberLevelBuyPoint(memberPoint);
      player.memberLevel = memberLevel;
      player.memberCurrentLevelPoint =
        memberPoint - this.playerService.getMemberTotalPoint(memberLevel);
      player.memberNextLevelPoint = this.playerService.getMemberNextLevelPoint(memberLevel);

      // 计算总等级和可用等级
      player.totalLevel = seasonLevel + memberLevel;
      const usedLevel = player.properties.reduce((prev, curr) => prev + curr.level, 0);
      player.useableLevel = player.totalLevel - usedLevel;
    }
    return players;
  }

  /**
   * 重置玩家属性
   * @param steamId Steam ID
   * @param useMemberPoint 是否使用会员积分
   */
  async resetPlayerProperty(steamId: number, useMemberPoint: boolean): Promise<void> {
    // 获取玩家信息
    const player = await this.findPlayerDtoBySteamId(steamId);

    if (!player) {
      throw new BadRequestException();
    }

    // 消耗积分
    if (useMemberPoint) {
      const resetPlayerPropertyMemberPoint = this.resetPlayerPropertyMemberPoint;
      if (player.memberPointTotal < resetPlayerPropertyMemberPoint) {
        throw new BadRequestException();
      }
      await this.playerService.upsertAddPoint(steamId, {
        memberPointTotal: -resetPlayerPropertyMemberPoint,
      });
    } else {
      // 使用 PlayerDto 中的 seasonNextLevelPoint
      const resetPlayerPropertySeasonPoint = player.seasonNextLevelPoint;
      if (player.seasonPointTotal < resetPlayerPropertySeasonPoint) {
        throw new BadRequestException();
      }
      await this.playerService.upsertAddPoint(steamId, {
        seasonPointTotal: -resetPlayerPropertySeasonPoint,
      });
    }

    // 重置玩家属性
    await this.playerPropertyService.deleteBySteamId(steamId);
  }

  /**
   * 升级玩家属性
   * @param updatePlayerPropertyDto 更新玩家属性 DTO
   * @returns 更新后的 PlayerDto
   */
  async upgradePlayerProperty(
    updatePlayerPropertyDto: UpdatePlayerPropertyDto,
  ): Promise<PlayerDto> {
    // 验证属性名称
    this.playerPropertyService.validatePropertyName(updatePlayerPropertyDto.name);

    // 检查现有属性以计算等级差值
    const existPlayerProperty = await this.playerPropertyService.findBySteamId(
      updatePlayerPropertyDto.steamId,
    );
    const existingProperty = existPlayerProperty.find(
      (p) => p.name === updatePlayerPropertyDto.name,
    );

    // 计算等级差值
    const levelAdd = existingProperty
      ? updatePlayerPropertyDto.level - existingProperty.level
      : updatePlayerPropertyDto.level;

    // 验证等级
    await this.checkPlayerLevel(updatePlayerPropertyDto.steamId, levelAdd);

    // 更新属性
    await this.playerPropertyService.update(updatePlayerPropertyDto);

    // 返回更新后的 PlayerDto
    return await this.findPlayerDtoBySteamId(updatePlayerPropertyDto.steamId);
  }

  // ------------------ private ------------------
  private async checkPlayerLevel(steamId: number, levelAdd: number) {
    const player = await this.playerService.findBySteamId(steamId);
    const totalLevel = this.playerService.getPlayerTotalLevel(player);
    const usedLevel = await this.playerPropertyService.getPlayerUsedLevel(steamId);
    if (totalLevel < usedLevel + levelAdd) {
      logger.warn('[Player Info] checkPlayerLevel error', {
        steamId,
        totalLevel,
        usedLevel,
        levelAdd,
      });
      throw new BadRequestException();
    }
  }
}
