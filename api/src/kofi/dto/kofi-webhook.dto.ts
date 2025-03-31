import { ApiProperty } from '@nestjs/swagger';

import { KofiType } from '../enums/kofi-type.enum';
import { KofiShipping, KofiShopItem } from '../types/kofi.types';

export class KofiWebhookDto {
  @ApiProperty({ example: 'kofi-verification-token' })
  verification_token: string;

  @ApiProperty({ example: 'd619baf6-c4ef-4862-bb0e-43922096868b' })
  message_id: string;

  @ApiProperty({ example: '2025-03-31T16:55:10Z' })
  timestamp: string;

  @ApiProperty({ enum: KofiType, example: KofiType.SUBSCRIPTION })
  type: KofiType;

  @ApiProperty({ example: true })
  is_public: boolean;

  @ApiProperty({ example: 'Jo Example' })
  from_name: string;

  @ApiProperty({ example: 'Good luck with the integration!' })
  message: string;

  @ApiProperty({ example: '3.00' })
  amount: string;

  @ApiProperty({
    example: 'https://ko-fi.com/Home/CoffeeShop?txid=00000000-1111-2222-3333-444444444444',
  })
  url: string;

  @ApiProperty({ example: 'jo.example@example.com' })
  email: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: true })
  is_subscription_payment: boolean;

  @ApiProperty({ example: true })
  is_first_subscription_payment: boolean;

  @ApiProperty({ example: '00000000-1111-2222-3333-444444444444' })
  kofi_transaction_id: string;

  @ApiProperty({ example: null, type: [KofiShopItem], nullable: true })
  shop_items: KofiShopItem[] | null;

  @ApiProperty({ example: null, nullable: true })
  tier_name: string | null;

  @ApiProperty({ example: null, type: KofiShipping, nullable: true })
  shipping: KofiShipping | null;
}
