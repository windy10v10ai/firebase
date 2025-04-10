import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Collection } from 'fireorm';

@Collection()
export class PlayerSetting {
  @Exclude()
  id: string;

  // 快捷键设置
  @ApiProperty()
  activeSkillKey: string;
  @ApiProperty()
  passiveSkillKey: string;

  // 为未来其他设置预留

  @Exclude()
  createdAt: Date;
  @Exclude()
  updatedAt: Date;
}
