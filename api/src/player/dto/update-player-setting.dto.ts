import { OmitType, PartialType } from '@nestjs/mapped-types';

import { PlayerSetting } from '../entities/player-setting.entity';

export class UpdatePlayerSettingDto extends PartialType(
  OmitType(PlayerSetting, ['id', 'createdAt', 'updatedAt'] as const),
) {}
