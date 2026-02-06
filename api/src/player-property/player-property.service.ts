import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerPropertyItemDto } from './dto/player-property-item.dto';
import { PlayerProperty } from './entities/player-property.entity';

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
  ) {}

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
