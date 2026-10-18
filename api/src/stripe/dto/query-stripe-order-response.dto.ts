import { ApiProperty } from '@nestjs/swagger';

import { StripeOrderStatus } from '../enums/stripe-order-status.enum';
import { StripeProductCode } from '../enums/stripe-product-code.enum';

export class QueryStripeOrderResponseDto {
  @ApiProperty()
  orderId!: string;

  @ApiProperty({ enum: StripeOrderStatus })
  status!: StripeOrderStatus;

  @ApiProperty({ enum: StripeProductCode })
  productCode!: StripeProductCode;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  amountCent!: number;
}
