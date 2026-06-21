import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class AwakenHeroDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  heroName: string;

  @ApiProperty()
  @IsBoolean()
  useMemberPoint: boolean;
}
