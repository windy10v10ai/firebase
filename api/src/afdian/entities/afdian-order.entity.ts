import { Collection } from 'fireorm';

import { OrderDto } from '../dto/afdian-webhook.dto';
import { OrderType } from '../enums/order-type.enum';

@Collection()
export class AfdianOrder {
  id: string;
  orderType: OrderType;
  success: boolean;
  userId: string;
  steamId: number;
  createdAt: Date;
  orderDto: OrderDto;
  outTradeNo: string;
}
