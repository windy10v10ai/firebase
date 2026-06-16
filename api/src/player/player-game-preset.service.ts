import { Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';

import { UpdatePlayerGamePresetDto } from './dto/update-player-game-preset.dto';
import { GamePresetCustomOptions, PlayerSetting } from './entities/player-setting.entity';
import { PlayerSettingService } from './player-setting.service';

export interface PlayerGamePreset {
  dota?: { difficulty: number };
  hard?: { difficulty: number };
  custom?: { gameOptions: GamePresetCustomOptions };
}

const DELETE = FieldValue.delete() as unknown as undefined;

@Injectable()
export class PlayerGamePresetService {
  constructor(private readonly playerSettingService: PlayerSettingService) {}

  async update(playerId: string, dto: UpdatePlayerGamePresetDto): Promise<PlayerGamePreset> {
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
    const updated = await this.playerSettingService.updateRaw(setting);
    return this.extractPreset(updated);
  }

  extractPreset(setting: PlayerSetting | null): PlayerGamePreset | null {
    if (!setting) return null;
    const preset: PlayerGamePreset = {};
    if (setting.gamePresetDota) preset.dota = setting.gamePresetDota;
    if (setting.gamePresetHard) preset.hard = setting.gamePresetHard;
    if (setting.gamePresetCustom) preset.custom = setting.gamePresetCustom;
    return Object.keys(preset).length > 0 ? preset : null;
  }
}
