import { ApiProperty } from '@nestjs/swagger';

import { KofiType } from '../enums/kofi-type.enum';
import { KofiShipping, KofiShopItem } from '../types/kofi.types';

export class KofiWebhookDto {
  @ApiProperty({
    description: '验证令牌',
    example: 'df4c8b0a-c223-4072-bd76-235d29b628bd',
  })
  verification_token: string;

  @ApiProperty({
    description: '消息ID',
    example: 'd619baf6-c4ef-4862-bb0e-43922096868b',
  })
  message_id: string;

  @ApiProperty({
    description: '时间戳',
    example: '2025-03-31T16:55:10Z',
  })
  timestamp: string;

  @ApiProperty({
    description: '类型',
    enum: KofiType,
    example: KofiType.SUBSCRIPTION,
  })
  type: KofiType;

  @ApiProperty({
    description: '是否公开',
    example: true,
  })
  is_public: boolean;

  @ApiProperty({
    description: '捐赠者名称',
    example: 'Jo Example',
  })
  from_name: string;

  @ApiProperty({
    description: '消息内容',
    example: 'Good luck with the integration!',
  })
  message: string;

  @ApiProperty({
    description: '金额',
    example: '3.00',
  })
  amount: string;

  @ApiProperty({
    description: '交易URL',
    example: 'https://ko-fi.com/Home/CoffeeShop?txid=00000000-1111-2222-3333-444444444444',
  })
  url: string;

  @ApiProperty({
    description: '捐赠者邮箱',
    example: 'jo.example@example.com',
  })
  email: string;

  @ApiProperty({
    description: '货币类型',
    example: 'USD',
  })
  currency: string;

  @ApiProperty({
    description: '是否为订阅支付',
    example: true,
  })
  is_subscription_payment: boolean;

  @ApiProperty({
    description: '是否为首次订阅支付',
    example: true,
  })
  is_first_subscription_payment: boolean;

  @ApiProperty({
    description: 'Kofi交易ID',
    example: '00000000-1111-2222-3333-444444444444',
  })
  kofi_transaction_id: string;

  @ApiProperty({
    description: '商店商品列表',
    example: null,
    type: [KofiShopItem],
    nullable: true,
  })
  shop_items: KofiShopItem[] | null;

  @ApiProperty({
    description: '会员等级名称',
    example: null,
    nullable: true,
  })
  tier_name: string | null;

  @ApiProperty({
    description: '运输信息',
    example: null,
    type: KofiShipping,
    nullable: true,
  })
  shipping: KofiShipping | null;
}
