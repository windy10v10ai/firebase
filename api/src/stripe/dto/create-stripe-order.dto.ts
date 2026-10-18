import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { STRIPE_LOCALES, StripeLocale } from '../stripe.constants';

export class CreateStripeOrderDto {
  @ApiProperty({ enum: STRIPE_LOCALES, required: false, description: '收银台语言，默认英文' })
  @IsOptional()
  @IsIn(STRIPE_LOCALES)
  locale?: StripeLocale;
}
