import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MemberDto } from '../../members/dto/member.dto';
import { PlayerSetting } from '../../player/entities/player-setting.entity';
import { PlayerStatsLifetime } from '../../player/entities/player-stats-lifetime.entity';
import { Player } from '../../player/entities/player.entity';
import { PlayerGamePreset } from '../../player/player-game-preset.service';
import { PlayerPropertyItemDto } from '../../player-property/dto/player-property-item.dto';

export class PlayerInfoDto extends Player {
  @ApiProperty()
  seasonLevel: number;
  @ApiProperty()
  seasonCurrrentLevelPoint: number;
  @ApiProperty()
  seasonNextLevelPoint: number;
  @ApiProperty()
  useableSeasonPoint: number;
  @ApiProperty()
  memberLevel: number;
  @ApiProperty()
  memberCurrentLevelPoint: number;
  @ApiProperty()
  memberNextLevelPoint: number;
  @ApiProperty()
  useableMemberPoint: number;
  @ApiProperty()
  totalLevel: number;
  @ApiProperty()
  useableLevel: number;
  @ApiPropertyOptional()
  properties?: PlayerPropertyItemDto[];
  @ApiPropertyOptional()
  playerSetting?: PlayerSetting;
  @ApiPropertyOptional()
  member?: MemberDto;
  @ApiPropertyOptional()
  statsLifetime?: PlayerStatsLifetime;
  @ApiPropertyOptional()
  gamePreset?: PlayerGamePreset;
}
