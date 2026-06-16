import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsObject, IsOptional, ValidateNested } from 'class-validator';

import { GamePresetCustomOptions } from '../entities/player-setting.entity';

export class UpdatePlayerGamePresetDto {
  @ApiProperty({ enum: ['dota', 'hard', 'custom'] })
  @IsIn(['dota', 'hard', 'custom'])
  map: 'dota' | 'hard' | 'custom';

  @ApiProperty()
  @IsBoolean()
  remember: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  difficulty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GamePresetCustomOptions)
  gameOptions?: GamePresetCustomOptions;
}
