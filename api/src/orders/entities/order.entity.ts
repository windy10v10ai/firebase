import { Collection } from 'fireorm';
import { OrderDto } from 'src/afdian/dto/afdian-webhook.dto';

import { OrderType } from '../enums/order-type.enum';

@Collection()
export class Order {
  id: string;
  platform: string;
  orderType: OrderType;
  success: boolean;
  userId: string;
  steamId: number;
  createdAt: Date;
  orderDto: OrderDto;
  outTradeNo: string;
}
