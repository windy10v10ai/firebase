import { ApiProperty } from '@nestjs/swagger';

import { StripeOrderStatus } from '../enums/stripe-order-status.enum';

export class QueryStripeOrderResponseDto {
  @ApiProperty()
  orderId!: string;

  @ApiProperty({ enum: StripeOrderStatus })
  status!: StripeOrderStatus;
}
