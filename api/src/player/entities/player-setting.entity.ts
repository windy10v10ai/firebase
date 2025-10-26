import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Collection } from 'fireorm';

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

  // 为未来其他设置预留

  @Exclude()
  createdAt: Date;
  @Exclude()
  updatedAt: Date;
}
