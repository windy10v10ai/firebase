import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';

import { PlayerService } from '../player/player.service';
import { PlayerPropertyItemDto } from '../player-property/dto/player-property-item.dto';
import { PlayerPropertyService } from '../player-property/player-property.service';

import { PlayerDtoAssembler } from './assemblers/player-dto.assembler';
import { PlayerDto } from './dto/player.dto';

@Injectable()
export class PlayerInfoService {
  private readonly resetPlayerPropertyMemberPoint = 1000;

  constructor(
    private readonly playerService: PlayerService,
    private readonly playerPropertyService: PlayerPropertyService,
    private readonly playerDtoAssembler: PlayerDtoAssembler,
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
    const players = await this.playerService.findByIds(ids);
    return Promise.all(players.map((player) => this.playerDtoAssembler.assemblePlayerDto(player)));
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
   * @param propertyDto 更新玩家属性 DTO
   */
  async upgradePlayerProperty(propertyDto: PlayerPropertyItemDto): Promise<void> {
    // 验证属性名称
    this.playerPropertyService.validatePropertyName(propertyDto.name);

    // 获取 PlayerDto（包含 useableLevel 和 properties）
    const playerDto = await this.findPlayerDtoBySteamId(propertyDto.steamId);
    if (!playerDto) {
      throw new BadRequestException();
    }

    // 查找现有属性并计算等级差值
    const existingProperty = playerDto.properties?.find((p) => p.name === propertyDto.name);
    const levelAdd = existingProperty
      ? propertyDto.level - existingProperty.level
      : propertyDto.level;

    // 验证可用等级是否足够
    if (playerDto.useableLevel < levelAdd) {
      logger.warn('[Player Info] upgradePlayerProperty error', {
        steamId: propertyDto.steamId,
        targetLevel: propertyDto.level,
        useableLevel: playerDto.useableLevel,
        levelAdd,
      });
      throw new BadRequestException();
    }

    // 更新属性
    await this.playerPropertyService.upsert(propertyDto);
  }
}
