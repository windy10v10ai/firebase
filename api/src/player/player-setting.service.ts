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

    if (updatePlayerSettingDto.activeSkillKey !== undefined) {
      setting.activeSkillKey = updatePlayerSettingDto.activeSkillKey;
    }
    if (updatePlayerSettingDto.passiveSkillKey !== undefined) {
      setting.passiveSkillKey = updatePlayerSettingDto.passiveSkillKey;
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
      activeSkillKey: '',
      passiveSkillKey: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.playerSettingRepository.create(defaultSetting);
  }
}
