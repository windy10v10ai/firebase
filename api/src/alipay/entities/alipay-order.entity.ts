import { Collection } from 'fireorm';

import { AlipayProductCode } from '../enums/alipay-product-code.enum';
import { AlipayTradeStatus } from '../enums/alipay-trade-status.enum';

@Collection('alipay-order')
export class AlipayOrder {
  id: string;
  outTradeNo: string;
  steamId: number;
  productCode: AlipayProductCode;
  quantity: number;
  totalAmountCent: number;
  subject: string;
  status: AlipayTradeStatus;
  qrCode: string;
  qrCodeExpiresAt: Date;
  /** 支付宝侧交易流水号，webhook 回写 */
  alipayTradeNo?: string;
  /** 支付宝用户唯一 ID（UID），webhook 回写 */
  buyerUserId?: string;
  /** 支付宝登录账号，脱敏后的手机号或邮箱，webhook 回写 */
  buyerLogonId?: string;
  gmtPayment?: Date;
  rawNotify?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
