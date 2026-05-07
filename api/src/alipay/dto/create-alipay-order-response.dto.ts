import { ApiProperty } from '@nestjs/swagger';

export class CreateAlipayOrderResponseDto {
  @ApiProperty()
  outTradeNo!: string;

  @ApiProperty()
  qrCode!: string;

  @ApiProperty({ description: '元，保留两位小数字符串' })
  totalAmount!: string;

  @ApiProperty()
  subject!: string;

  @ApiProperty({ description: 'ISO 8601' })
  expiresAt!: string;
}
