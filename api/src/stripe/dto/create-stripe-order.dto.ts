import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsOptional, Min } from 'class-validator';

import { StripeProductCode } from '../enums/stripe-product-code.enum';
import { STRIPE_LOCALES, StripeLocale } from '../stripe.constants';

export class CreateStripeOrderDto {
  @ApiProperty({ enum: StripeProductCode, required: false, description: '默认高级会员' })
  @IsOptional()
  @IsEnum(StripeProductCode)
  productCode?: StripeProductCode;

  @ApiProperty({ required: false, description: '会员为月数，积分包为份数，默认 1' })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty({ enum: STRIPE_LOCALES, required: false, description: '收银台语言，默认英文' })
  @IsOptional()
  @IsIn(STRIPE_LOCALES)
  locale?: StripeLocale;
}
