import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class QueryAlipayOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  outTradeNo!: string;
}
