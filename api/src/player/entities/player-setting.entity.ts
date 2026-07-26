import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Collection } from 'fireorm';

export class GamePresetCustomOptions {
  @ApiProperty()
  multiplierRadiant: number;
  @ApiProperty()
  multiplierDire: number;
  @ApiProperty()
  playerNumberRadiant: number;
  @ApiProperty()
  playerNumberDire: number;
  @ApiProperty()
  towerPowerPct: number;
  @ApiProperty()
  respawnTimePct: number;
  @ApiProperty()
  startingGoldPlayer: number;
  @ApiProperty()
  startingGoldBot: number;
  @ApiProperty()
  maxLevel: number;
  @ApiProperty()
  fixedAbility: string;
  @ApiProperty()
  forceRandomHero: number;
  @ApiProperty()
  enablePlayerAttribute: number;
  @ApiProperty()
  midOnlyMode: number;
}

@Collection()
export class PlayerSetting {
  @ApiProperty()
  id: string;

  // 不记忆快捷键
  @ApiProperty()
  isRememberAbilityKey: boolean;
  // 快捷键设置
  @ApiProperty()
  activeAbilityKey: string;
  @ApiProperty()
  passiveAbilityKey: string;
  @ApiProperty()
  passiveAbilityKey2: string;
  // 快捷施法
  @ApiProperty()
  activeAbilityQuickCast: boolean;
  @ApiProperty()
  passiveAbilityQuickCast: boolean;
  @ApiProperty()
  passiveAbilityQuickCast2: boolean;

  // 背包 7/8/9 格改键
  @ApiProperty({ required: false })
  inventorySlot7Key?: string;
  @ApiProperty({ required: false })
  inventorySlot7QuickCast?: boolean;
  @ApiProperty({ required: false })
  inventorySlot8Key?: string;
  @ApiProperty({ required: false })
  inventorySlot8QuickCast?: boolean;
  @ApiProperty({ required: false })
  inventorySlot9Key?: string;
  @ApiProperty({ required: false })
  inventorySlot9QuickCast?: boolean;

  // 按地图游戏预设
  @ApiPropertyOptional()
  gamePresetDota?: { difficulty: number };
  @ApiPropertyOptional()
  gamePresetHard?: { difficulty: number };
  @ApiPropertyOptional()
  gamePresetCustom?: { gameOptions: GamePresetCustomOptions };

  @Exclude()
  createdAt: Date;
  @Exclude()
  updatedAt: Date;
}
