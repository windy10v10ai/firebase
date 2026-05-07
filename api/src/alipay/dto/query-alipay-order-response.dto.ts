import { ApiProperty } from '@nestjs/swagger';

import { AlipayTradeStatus } from '../enums/alipay-trade-status.enum';

export class QueryAlipayOrderResponseDto {
  @ApiProperty()
  outTradeNo!: string;

  @ApiProperty({ enum: AlipayTradeStatus })
  status!: AlipayTradeStatus;
}
