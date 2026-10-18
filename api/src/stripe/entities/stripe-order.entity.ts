import { Collection } from 'fireorm';

import { MemberLevel } from '../../members/entities/members.entity';
import { StripeOrderStatus } from '../enums/stripe-order-status.enum';

@Collection()
export class StripeOrder {
  /** 本地订单号，同时作为 Checkout 的 client_reference_id */
  id: string;
  steamId: number;
  level: MemberLevel;
  month: number;
  amountCent: number;
  currency: string;
  status: StripeOrderStatus;
  checkoutSessionId?: string;
  /** 回调回写，退款与拒付在后台按它查 */
  paymentIntentId?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
