import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LocalizedTextDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cn: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  en: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ru: string;
}
