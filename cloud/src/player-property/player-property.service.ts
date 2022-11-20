import * as fs from 'fs';

import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
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
    'property_cast_range_bonus_stacking',
    'property_spell_amplify_percentage',
    'property_status_resistance_stacking',
    'property_magical_resistance_bonus',
    'property_attack_range_bonus',
    'property_physical_armor_bonus',
    'property_preattack_bonus_damage',
    'property_attackspeed_bonus_constant',
    'property_stats_strength_bonus',
    'property_stats_agility_bonus',
    'property_stats_intellect_bonus',
    'property_health_regen_percentage',
    'property_mana_regen_total_percentage',
    'property_lifesteal',
    'property_spell_lifesteal',
    'property_movespeed_bonus_constant',
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
    await this.cheakPlayerLevel(
      createPlayerPropertyDto.steamId,
      createPlayerPropertyDto.level,
    );
    return this.playerPropertyRepository.create({
      id: this.buildId(
        createPlayerPropertyDto.steamId,
        createPlayerPropertyDto.name,
      ),
      ...createPlayerPropertyDto,
    });
  }
  async update(updatePlayerPropertyDto: UpdatePlayerPropertyDto) {
    this.validatePropertyName(updatePlayerPropertyDto.name);
    const existPlayerProperty = await this.playerPropertyRepository.findById(
      this.buildId(
        updatePlayerPropertyDto.steamId,
        updatePlayerPropertyDto.name,
      ),
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

  async getAll() {
    return this.playerPropertyRepository.find();
  }

  async initialLevel() {
    for (const memberLevel of this.memberLevelList) {
      await this.playerService.setMemberLevel(
        memberLevel.steamId,
        memberLevel.level,
      );
    }
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
  findBySteamId(steamId: number) {
    return this.playerPropertyRepository
      .whereEqualTo('steamId', steamId)
      .find();
  }

  async getPlayerUsedLevel(steamId: number) {
    const playerProperties = await this.findBySteamId(steamId);
    let usedLevel = 0;
    playerProperties.forEach((playerProperty) => {
      usedLevel += playerProperty.level;
    });
    return usedLevel;
  }

  private async cheakPlayerLevel(steamId: number, levelAdd: number) {
    const totalLevel = await this.playerService.getPlayerTotalLevel(steamId);
    const usedLevel = await this.getPlayerUsedLevel(steamId);
    if (totalLevel < usedLevel + levelAdd) {
      console.error(
        'cheakPlayerLevel error',
        `steamId ${steamId}`,
        `totalLevel ${totalLevel}`,
        `usedLevel ${usedLevel}`,
        `levelAdd ${levelAdd}`,
      );
      throw new BadRequestException();
    }
  }
  private validatePropertyName(name: string) {
    if (!PlayerPropertyService.PROPERTY_NAME_LIST.includes(name)) {
      console.error('validatePropertyName error', `name ${name}`);
      throw new BadRequestException();
    }
  }
  private buildId(steamId: number, name: string) {
    return steamId.toString() + '#' + name;
  }

  memberLevelList = [{ steamId: 136407523, level: 32 }];
}
