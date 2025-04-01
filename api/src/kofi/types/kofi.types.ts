import { ApiProperty } from '@nestjs/swagger';

export class KofiShopItem {
  @ApiProperty({ example: '1a2b3c4d5e' })
  direct_link_code: string;

  @ApiProperty({ example: 'Blue' })
  variation_name: string;

  @ApiProperty({ example: 1 })
  quantity: number;
}

export class KofiShipping {
  @ApiProperty({ example: 'Ko-fi Mail Room' })
  full_name: string;

  @ApiProperty({ example: '123 The Old Exchange, High Street' })
  street_address: string;

  @ApiProperty({ example: 'Bigville' })
  city: string;

  @ApiProperty({ example: 'Kansas' })
  state_or_province: string;

  @ApiProperty({ example: '12345' })
  postal_code: string;

  @ApiProperty({ example: 'United States' })
  country: string;

  @ApiProperty({ example: 'US' })
  country_code: string;

  @ApiProperty({ example: '+1-212-456-7890' })
  telephone: string;
}
