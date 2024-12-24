import { ApiProperty } from '@nestjs/swagger';

export class ActiveAfdianOrderDto {
  @ApiProperty()
  outTradeNo!: string;
  @ApiProperty()
  steamId!: number;
}
