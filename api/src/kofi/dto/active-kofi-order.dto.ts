import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class ActiveKofiOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  email!: string;
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  steamId!: number;
}
