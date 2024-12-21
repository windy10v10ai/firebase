import * as fs from 'fs';

import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { logger } from 'firebase-functions';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { PlayerService } from '../player/player.service';

import { CreatePlayerPropertyDto } from './dto/create-player-property.dto';
import { UpdatePlayerPropertyDto } from './dto/update-player-property.dto';
import { PlayerProperty } from './entities/player-property.entity';
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
  ];

  constructor(
    @InjectRepository(PlayerProperty)
    private readonly playerPropertyRepository: BaseFirestoreRepository<PlayerProperty>,
    private readonly playerService: PlayerService,
  ) {}

  async create(createPlayerPropertyDto: CreatePlayerPropertyDto) {
    this.validatePropertyName(createPlayerPropertyDto.name);
    await this.cheakPlayerLevel(createPlayerPropertyDto.steamId, createPlayerPropertyDto.level);
    return this.playerPropertyRepository.create({
      id: this.buildId(createPlayerPropertyDto.steamId, createPlayerPropertyDto.name),
      ...createPlayerPropertyDto,
    });
  }
  async update(updatePlayerPropertyDto: UpdatePlayerPropertyDto): Promise<PlayerProperty> {
    this.validatePropertyName(updatePlayerPropertyDto.name);
    const existPlayerProperty = await this.playerPropertyRepository.findById(
      this.buildId(updatePlayerPropertyDto.steamId, updatePlayerPropertyDto.name),
    );

    if (existPlayerProperty) {
      await this.cheakPlayerLevel(
        updatePlayerPropertyDto.steamId,
        updatePlayerPropertyDto.level - existPlayerProperty.level,
      );
      existPlayerProperty.level = updatePlayerPropertyDto.level;
      return this.playerPropertyRepository.update(existPlayerProperty);
    } else {
      return this.create({ ...updatePlayerPropertyDto });
    }
  }

  async csv() {
    let returnString = '';
    for (const name of PlayerPropertyService.PROPERTY_NAME_LIST) {
      const playerPropertys = await this.playerPropertyRepository.whereEqualTo('name', name).find();
      // seasonPointTotal, matchCount
      // create csv
      const totalLevel = playerPropertys.reduce(
        (total, playerProperty) => total + playerProperty.level,
        0,
      );
      returnString += `${name}	${playerPropertys.length}	${totalLevel}\n`;
    }
    return returnString;
  }

  async initialProperty() {
    const propertyData = fs.readFileSync('src/player-property/property.csv');
    const propertyList = parse(propertyData, {
      // key for each property
      columns: true,
      // skip the first line
      skip_empty_lines: true,
    });
    for (const property of propertyList) {
      // property get keys
      const propertyKeys = Object.keys(property);
      for (const propertyKey of propertyKeys) {
        // if property key is not steamId
        if (propertyKey !== 'steamId') {
          if (property[propertyKey] !== '') {
            await this.update({
              steamId: Number(property.steamId),
              name: propertyKey,
              level: Number(property[propertyKey]),
            });
          }
        }
      }
    }
  }
  async findBySteamId(steamId: number) {
    return this.playerPropertyRepository.whereEqualTo('steamId', steamId).find();
  }

  async deleteBySteamId(steamId: number) {
    const playerPropertyList = await this.findBySteamId(steamId);
    for (const playerProperty of playerPropertyList) {
      await this.playerPropertyRepository.delete(playerProperty.id);
    }
  }

  async getPlayerUsedLevel(steamId: number) {
    const playerProperties = await this.findBySteamId(steamId);
    let usedLevel = 0;
    playerProperties.forEach((playerProperty) => {
      usedLevel += playerProperty.level;
    });
    return usedLevel;
  }

  // ------------------ private ------------------
  private async cheakPlayerLevel(steamId: number, levelAdd: number) {
    const totalLevel = await this.playerService.getPlayerTotalLevel(steamId);
    const usedLevel = await this.getPlayerUsedLevel(steamId);
    if (totalLevel < usedLevel + levelAdd) {
      logger.error('[Player Property] cheakPlayerLevel error', {
        steamId,
        totalLevel,
        usedLevel,
        levelAdd,
      });
      throw new BadRequestException();
    }
  }
  private validatePropertyName(name: string) {
    if (!PlayerPropertyService.PROPERTY_NAME_LIST.includes(name)) {
      logger.error(`[Player Property] validatePropertyName error, name ${name}`);
      throw new BadRequestException();
    }
  }
  private buildId(steamId: number, name: string) {
    return steamId.toString() + '#' + name;
  }
}
