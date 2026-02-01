import { BadRequestException, Injectable } from '@nestjs/common';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { CreatePlayerPropertyDto } from './dto/create-player-property.dto';
import { UpdatePlayerPropertyDto } from './dto/update-player-property.dto';
import { PlayerProperty } from './entities/player-property.entity';

/**
 * @deprecated 此 Service 将在未来版本中移除，请使用 PlayerPropertyV2Service 替代
 */
@Injectable()
export class PlayerPropertyService {
  static PROPERTY_NAME_LIST = [
    'property_cooldown_percentage',
    'property_movespeed_bonus_constant',
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

  /**
   * @deprecated 此方法将在未来版本中移除，请使用 PlayerPropertyV2Service.create 替代
   */
  async create(createPlayerPropertyDto: CreatePlayerPropertyDto) {
    return this.playerPropertyRepository.create({
      id: this.buildId(createPlayerPropertyDto.steamId, createPlayerPropertyDto.name),
      ...createPlayerPropertyDto,
    });
  }
  /**
   * @deprecated 此方法将在未来版本中移除，请使用 PlayerPropertyV2Service.update 替代
   */
  async update(updatePlayerPropertyDto: UpdatePlayerPropertyDto): Promise<PlayerProperty> {
    const existPlayerProperty = await this.playerPropertyRepository.findById(
      this.buildId(updatePlayerPropertyDto.steamId, updatePlayerPropertyDto.name),
    );

    if (existPlayerProperty) {
      existPlayerProperty.level = updatePlayerPropertyDto.level;
      return this.playerPropertyRepository.update(existPlayerProperty);
    } else {
      return this.create({ ...updatePlayerPropertyDto });
    }
  }

  /**
   * @deprecated 此方法将在未来版本中移除，请使用 PlayerPropertyV2Service.findBySteamId 替代
   */
  async findBySteamId(steamId: number) {
    return this.playerPropertyRepository.whereEqualTo('steamId', steamId).find();
  }

  /**
   * @deprecated 此方法将在未来版本中移除，请使用 PlayerPropertyV2Service.deleteBySteamId 替代
   */
  async deleteBySteamId(steamId: number) {
    const playerPropertyList = await this.findBySteamId(steamId);
    for (const playerProperty of playerPropertyList) {
      await this.playerPropertyRepository.delete(playerProperty.id);
    }
  }

  /**
   * @deprecated 此方法将在未来版本中移除，请使用 PlayerPropertyV2Service.getPlayerUsedLevel 替代
   */
  async getPlayerUsedLevel(steamId: number) {
    const playerProperties = await this.findBySteamId(steamId);
    let usedLevel = 0;
    playerProperties.forEach((playerProperty) => {
      usedLevel += playerProperty.level;
    });
    return usedLevel;
  }

  // ------------------ private ------------------
  public validatePropertyName(name: string) {
    if (!PlayerPropertyService.PROPERTY_NAME_LIST.includes(name)) {
      logger.error(`[Player Property] validatePropertyName error, name ${name}`);
      throw new BadRequestException();
    }
  }
  private buildId(steamId: number, name: string) {
    return steamId.toString() + '#' + name;
  }
}
