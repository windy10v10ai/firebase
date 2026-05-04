import { Collection } from 'fireorm';

import { AlipayProductCode } from '../enums/alipay-product-code.enum';
import { AlipayTradeStatus } from '../enums/alipay-trade-status.enum';

@Collection('alipay-order')
export class AlipayOrder {
  id: string;
  /** 商家订单号 */
  outTradeNo: string;
  steamId: number;
  productCode: AlipayProductCode;
  quantity: number;
  totalAmountCent: number;
  subject: string;
  status: AlipayTradeStatus;
  qrCode: string;
  qrCodeExpiresAt: Date;
  /** 支付宝 订单号，用户扫码后创建 webhook 回写 */
  alipayTradeNo?: string;
  /** 支付宝用户唯一 ID（UID），webhook 回写 */
  buyerUserId?: string;
  /** 支付宝登录账号，脱敏后的手机号或邮箱，webhook 回写 */
  buyerLogonId?: string;
  /** 用户实际付款时间（北京时间），webhook 回写，仅用于审计对账 */
  gmtPayment?: Date;
  rawNotify?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
