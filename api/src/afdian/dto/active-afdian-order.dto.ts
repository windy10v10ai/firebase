import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
export class ActiveAfdianOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  outTradeNo!: string;
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  steamId!: number;
}
