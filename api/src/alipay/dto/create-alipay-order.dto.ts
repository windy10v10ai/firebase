import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';

import { AlipayProductCode } from '../enums/alipay-product-code.enum';

export class CreateAlipayOrderDto {
  @ApiProperty()
  @IsInt()
  @IsNotEmpty()
  steamId!: number;

  @ApiProperty({ enum: AlipayProductCode })
  @IsEnum(AlipayProductCode)
  @IsNotEmpty()
  productCode!: AlipayProductCode;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
