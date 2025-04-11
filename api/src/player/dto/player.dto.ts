import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PlayerProperty } from '../../player-property/entities/player-property.entity';
import { PlayerSetting } from '../entities/player-setting.entity';
import { Player } from '../entities/player.entity';

export class PlayerDto extends Player {
  @ApiProperty()
  seasonLevel: number;
  @ApiProperty()
  seasonCurrrentLevelPoint: number;
  @ApiProperty()
  seasonNextLevelPoint: number;
  @ApiProperty()
  memberLevel: number;
  @ApiProperty()
  memberCurrentLevelPoint: number;
  @ApiProperty()
  memberNextLevelPoint: number;
  @ApiProperty()
  totalLevel: number;
  @ApiProperty()
  useableLevel: number;
  @ApiPropertyOptional()
  properties?: PlayerProperty[];
  @ApiProperty()
  playerSetting: PlayerSetting;
}
