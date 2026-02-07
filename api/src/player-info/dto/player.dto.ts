import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PlayerSetting } from '../../player/entities/player-setting.entity';
import { Player } from '../../player/entities/player.entity';
import { PlayerPropertyItemDto } from '../../player-property/dto/player-property-item.dto';

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
  properties?: PlayerPropertyItemDto[];
  @ApiProperty()
  playerSetting: PlayerSetting;
}
