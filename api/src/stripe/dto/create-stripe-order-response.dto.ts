import { ApiProperty } from '@nestjs/swagger';

export class CreateStripeOrderResponseDto {
  @ApiProperty()
  orderId!: string;

  @ApiProperty({ description: 'Stripe 托管收银台地址，网站直接跳转' })
  checkoutUrl!: string;
}
