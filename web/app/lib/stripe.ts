import { apiFetch } from './api';

// 以下类型照抄 API 响应
export interface StripeOrderCreated {
  orderId: string;
  checkoutUrl: string;
}

export type StripeOrderStatusValue = 'WAITING' | 'SUCCESS';

export interface StripeOrderStatus {
  orderId: string;
  status: StripeOrderStatusValue;
}

/** 为当前登录玩家下单，拿到 Stripe 收银台地址；收银台语言跟随网站语言 */
export function createStripeOrder(locale: string) {
  return apiFetch<StripeOrderCreated>('/api/stripe/order', {
    method: 'POST',
    body: JSON.stringify({ locale }),
  });
}

export function queryStripeOrder(orderId: string) {
  return apiFetch<StripeOrderStatus>(`/api/stripe/order/${encodeURIComponent(orderId)}`);
}
