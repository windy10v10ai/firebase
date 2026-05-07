import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerLevelHelper } from '../player/helpers/player-level.helper';
import { PlayerService } from '../player/player.service';

import { PlayerPropertyItemDto } from './dto/player-property-item.dto';
import { PlayerProperty } from './entities/player-property.entity';

const RESET_PROPERTY_MEMBER_POINT_COST = 1000;

@Injectable()
export class PlayerPropertyService {
  static PROPERTY_NAME_LIST = [
    'property_cooldown_percentage',
    'property_movespeed_bonus_constant',
    'property_bonus_vision',
    'property_skill_points_bonus',
    'property_cast_range_bonus_stacking',
    'property_spell_amplify_percentage',
    'property_status_resistance_stacking',
    'property_evasion_constant',
    'property_magical_resistance_bonus',
    'property_incoming_damage_percentage',
    'property_attack_range_bonus',
    'property_physical_armor_bonus',
    'property_preattack_bonus_damage',
    'property_attackspeed_bonus_constant',
    'property_stats_strength_bonus',
    'property_stats_agility_bonus',
    'property_stats_intellect_bonus',
    'property_lifesteal',
    'property_spell_lifesteal',
    'property_health_regen_percentage',
    'property_mana_regen_total_percentage',
    'property_ignore_movespeed_limit',
    'property_cannot_miss',
    'property_flying',
  ];

  constructor(
    @InjectRepository(PlayerProperty)
    private readonly playerPropertyRepository: BaseFirestoreRepository<PlayerProperty>,
    private readonly playerService: PlayerService,
  ) {}

  /**
   * 升级玩家属性
   * 1. 校验属性名
   * 2. 校验可用等级是否足够（levelDelta 必须 > 0）
   * 3. 写入 property 文档
   * 4. 同步 player.usedLevel（双写埋点，等回填脚本完成后切换读取路径）
   */
  async upgrade(propertyDto: PlayerPropertyItemDto): Promise<void> {
    this.validatePropertyName(propertyDto.name);

    const player = await this.playerService.findBySteamId(propertyDto.steamId);
    if (!player) {
      throw new BadRequestException();
    }

    const existingProperties = await this.findBySteamId(propertyDto.steamId);
    const existing = existingProperties.find((p) => p.name === propertyDto.name);
    const levelDelta = propertyDto.level - (existing?.level ?? 0);

    // 允许 levelDelta = 0（重发同等级 → 幂等成功）；只拒绝降级。
    if (levelDelta < 0) {
      logger.warn('[Player Property] upgrade error: cannot downgrade', {
        steamId: propertyDto.steamId,
        name: propertyDto.name,
        targetLevel: propertyDto.level,
        existingLevel: existing?.level ?? 0,
      });
      throw new BadRequestException();
    }

    // 故意从 properties 累加而不是读 player.usedLevel：
    // properties 文档是权威源，每次 upgrade 用它重算可在部分失败重试时自愈，
    // 不会因为 player.usedLevel 此前的偏差而继续累积错误。
    const currentUsedLevel = PlayerLevelHelper.calculateUsedLevel(existingProperties);
    const totalLevel = PlayerLevelHelper.getPlayerTotalLevel(player);
    if (totalLevel - currentUsedLevel < levelDelta) {
      logger.warn('[Player Property] upgrade error: not enough useable level', {
        steamId: propertyDto.steamId,
        targetLevel: propertyDto.level,
        usedLevel: currentUsedLevel,
        totalLevel,
        levelDelta,
      });
      throw new BadRequestException();
    }

    await this.upsert(propertyDto);
    // 用 override 而非 increment：基于已读取的 properties 直接算出升级后的真实 usedLevel。
    // 这样对部分失败重试有自愈能力（再次执行会读到最新 property 文档、写出正确值），
    // 不会像增量写入那样累积偏差。
    const newUsedLevel = currentUsedLevel + levelDelta;
    await this.playerService.setUsedLevel(propertyDto.steamId, newUsedLevel);
  }

  /**
   * 重置玩家属性
   * 消耗赛季积分或会员积分，删除 property 文档，并将 player.usedLevel 重置为 0
   */
  async reset(steamId: number, useMemberPoint: boolean): Promise<void> {
    const player = await this.playerService.findBySteamId(steamId);
    if (!player) {
      throw new BadRequestException();
    }

    if (useMemberPoint) {
      const cost = RESET_PROPERTY_MEMBER_POINT_COST;
      if (player.memberPointTotal < cost) {
        throw new BadRequestException();
      }
      await this.playerService.upsertAddPoint(steamId, { memberPointTotal: -cost });
    } else {
      const seasonLevel = PlayerLevelHelper.getSeasonLevelBuyPoint(player.seasonPointTotal);
      const cost = PlayerLevelHelper.getSeasonNextLevelPoint(seasonLevel);
      if (player.seasonPointTotal < cost) {
        throw new BadRequestException();
      }
      await this.playerService.upsertAddPoint(steamId, { seasonPointTotal: -cost });
    }

    await this.deleteBySteamId(steamId);
  }

  async upsert(propertyDto: PlayerPropertyItemDto): Promise<PlayerProperty> {
    const id = propertyDto.steamId.toString();
    let playerProperty = await this.playerPropertyRepository.findById(id);

    if (!playerProperty) {
      // 创建新文档，初始化 properties 为空数组
      playerProperty = {
        id,
        steamId: propertyDto.steamId,
        properties: [],
      };
      await this.playerPropertyRepository.create(playerProperty);
    }

    this.setPropertyLevel(playerProperty, propertyDto.name, propertyDto.level);

    return this.playerPropertyRepository.update(playerProperty);
  }

  async findBySteamId(steamId: number): Promise<PlayerPropertyItemDto[]> {
    const playerProperty = await this.playerPropertyRepository.findById(steamId.toString());
    if (!playerProperty) {
      return [];
    }

    return playerProperty.properties
      .filter((p) => p.level > 0)
      .map((p) => ({
        steamId: playerProperty.steamId,
        name: p.name,
        level: p.level,
      }));
  }

  async deleteBySteamId(steamId: number): Promise<void> {
    const id = steamId.toString();
    await this.playerPropertyRepository.delete(id);
    await this.playerService.setUsedLevel(steamId, 0);
  }

  // ------------------ private ------------------
  public validatePropertyName(name: string) {
    if (!PlayerPropertyService.PROPERTY_NAME_LIST.includes(name)) {
      logger.error(`[Player Property] validatePropertyName error, name ${name}`);
      throw new BadRequestException();
    }
  }

  private setPropertyLevel(
    playerProperty: PlayerProperty,
    propertyName: string,
    level: number,
  ): void {
    // 1. 运行时验证（防止无效属性名）
    if (!PlayerPropertyService.PROPERTY_NAME_LIST.includes(propertyName)) {
      throw new BadRequestException(`Invalid property name: ${propertyName}`);
    }

    // 2. 查找或添加属性
    const property = playerProperty.properties.find((p) => p.name === propertyName);
    if (property) {
      property.level = level;
    } else {
      playerProperty.properties.push({ name: propertyName, level });
    }
  }
}
