import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

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
