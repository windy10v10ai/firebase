import { Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';

import { UpdatePlayerGamePresetDto } from './dto/update-player-game-preset.dto';
import { PlayerSetting } from './entities/player-setting.entity';
import { PlayerSettingService } from './player-setting.service';

const DELETE = FieldValue.delete() as unknown as undefined;

@Injectable()
export class PlayerGamePresetService {
  constructor(private readonly playerSettingService: PlayerSettingService) {}

  async update(playerId: string, dto: UpdatePlayerGamePresetDto): Promise<PlayerSetting> {
    const setting = await this.playerSettingService.getPlayerSettingOrGenerateDefault(playerId);

    if (dto.remember) {
      if (dto.map === 'dota') {
        setting.gamePresetDota = { difficulty: dto.difficulty };
      } else if (dto.map === 'hard') {
        setting.gamePresetHard = { difficulty: dto.difficulty };
      } else if (dto.map === 'custom') {
        // JSON round-trip strips undefined fields that Firestore would reject
        setting.gamePresetCustom = JSON.parse(JSON.stringify({ gameOptions: dto.gameOptions }));
      }
    } else {
      // undefined is silently ignored by Firestore; FieldValue.delete() actually removes the field
      if (dto.map === 'dota') setting.gamePresetDota = DELETE;
      else if (dto.map === 'hard') setting.gamePresetHard = DELETE;
      else if (dto.map === 'custom') setting.gamePresetCustom = DELETE;
    }

    setting.updatedAt = new Date();
    return this.playerSettingService.updateRaw(setting);
  }
}
