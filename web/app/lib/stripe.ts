import { apiFetch } from './api';

import type { StripeProductCode } from '@/config/membership';

// 以下类型照抄 API 响应
export interface StripeOrderCreated {
  orderId: string;
  checkoutUrl: string;
}

export type StripeOrderStatusValue = 'WAITING' | 'SUCCESS';

export interface StripeOrderStatus {
  orderId: string;
  status: StripeOrderStatusValue;
  productCode: StripeProductCode;
  quantity: number;
  amountCent: number;
}

export interface StripeOrderRequest {
  productCode: StripeProductCode;
  /** 会员为月数，积分包为 1 */
  quantity: number;
  /** 收银台语言跟随网站语言 */
  locale: string;
}

/** 为当前登录玩家下单，拿到 Stripe 收银台地址 */
export function createStripeOrder(request: StripeOrderRequest) {
  return apiFetch<StripeOrderCreated>('/api/stripe/order', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function queryStripeOrder(orderId: string) {
  return apiFetch<StripeOrderStatus>(`/api/stripe/order/${encodeURIComponent(orderId)}`);
}
