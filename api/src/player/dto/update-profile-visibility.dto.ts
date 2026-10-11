import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateProfileVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  profileHidden!: boolean;
}
