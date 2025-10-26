import { Injectable } from '@nestjs/common';
import { BaseFirestoreRepository } from 'fireorm';
import { InjectRepository } from 'nestjs-fireorm';

import { UpdatePlayerSettingDto } from './dto/update-player-setting.dto';
import { PlayerSetting } from './entities/player-setting.entity';

@Injectable()
export class PlayerSettingService {
  constructor(
    @InjectRepository(PlayerSetting)
    private readonly playerSettingRepository: BaseFirestoreRepository<PlayerSetting>,
  ) {}

  async update(
    playerId: string,
    updatePlayerSettingDto: UpdatePlayerSettingDto,
  ): Promise<PlayerSetting> {
    const setting = await this.getPlayerSettingOrGenerateDefault(playerId);

    if (updatePlayerSettingDto.isRememberAbilityKey !== undefined) {
      setting.isRememberAbilityKey = updatePlayerSettingDto.isRememberAbilityKey;
    }
    if (updatePlayerSettingDto.activeAbilityQuickCast !== undefined) {
      setting.activeAbilityQuickCast = updatePlayerSettingDto.activeAbilityQuickCast;
    }
    if (updatePlayerSettingDto.passiveAbilityQuickCast !== undefined) {
      setting.passiveAbilityQuickCast = updatePlayerSettingDto.passiveAbilityQuickCast;
    }
    if (updatePlayerSettingDto.passiveAbilityQuickCast2 !== undefined) {
      setting.passiveAbilityQuickCast2 = updatePlayerSettingDto.passiveAbilityQuickCast2;
    }
    if (setting.isRememberAbilityKey) {
      if (updatePlayerSettingDto.activeAbilityKey !== undefined) {
        setting.activeAbilityKey = updatePlayerSettingDto.activeAbilityKey;
      }
      if (updatePlayerSettingDto.passiveAbilityKey !== undefined) {
        setting.passiveAbilityKey = updatePlayerSettingDto.passiveAbilityKey;
      }
      if (updatePlayerSettingDto.passiveAbilityKey2 !== undefined) {
        setting.passiveAbilityKey2 = updatePlayerSettingDto.passiveAbilityKey2;
      }
    } else {
      setting.activeAbilityKey = '';
      setting.passiveAbilityKey = '';
      setting.passiveAbilityKey2 = '';
    }
    setting.updatedAt = new Date();
    return this.playerSettingRepository.update(setting);
  }

  public async getPlayerSettingOrGenerateDefault(playerId: string): Promise<PlayerSetting> {
    const setting = await this.playerSettingRepository.findById(playerId);
    if (setting) {
      return setting;
    } else {
      return this.createDefaultSettings(playerId);
    }
  }

  private async createDefaultSettings(playerId: string): Promise<PlayerSetting> {
    const defaultSetting: PlayerSetting = {
      id: playerId,
      isRememberAbilityKey: false,
      activeAbilityKey: '',
      passiveAbilityKey: '',
      passiveAbilityKey2: '',
      activeAbilityQuickCast: false,
      passiveAbilityQuickCast: false,
      passiveAbilityQuickCast2: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.playerSettingRepository.create(defaultSetting);
  }
}
