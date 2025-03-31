import { ApiProperty } from '@nestjs/swagger';

export class KofiShopItem {
  @ApiProperty({
    description: '直接链接代码',
    example: '1a2b3c4d5e',
  })
  direct_link_code: string;

  @ApiProperty({
    description: '变体名称',
    example: 'Blue',
  })
  variation_name: string;

  @ApiProperty({
    description: '数量',
    example: 1,
  })
  quantity: number;
}

export class KofiShipping {
  @ApiProperty({
    description: '完整姓名',
    example: 'Ko-fi Mail Room',
  })
  full_name: string;

  @ApiProperty({
    description: '街道地址',
    example: '123 The Old Exchange, High Street',
  })
  street_address: string;

  @ApiProperty({
    description: '城市',
    example: 'Bigville',
  })
  city: string;

  @ApiProperty({
    description: '州或省',
    example: 'Kansas',
  })
  state_or_province: string;

  @ApiProperty({
    description: '邮政编码',
    example: '12345',
  })
  postal_code: string;

  @ApiProperty({
    description: '国家',
    example: 'United States',
  })
  country: string;

  @ApiProperty({
    description: '国家代码',
    example: 'US',
  })
  country_code: string;

  @ApiProperty({
    description: '电话号码',
    example: '+1-212-456-7890',
  })
  telephone: string;
}
