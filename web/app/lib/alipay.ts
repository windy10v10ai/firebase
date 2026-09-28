import { apiFetch } from './api';

import type { AlipayProductCode } from '@/config/membership';

// 以下类型照抄 API 响应
export interface AlipayOrderCreated {
  outTradeNo: string;
  qrCode: string;
  totalAmount: string;
  subject: string;
  expiresAt: string;
}

export type AlipayTradeStatus = 'WAITING' | 'SUCCESS' | 'CLOSED' | 'FAILED';

export interface AlipayOrderStatus {
  outTradeNo: string;
  status: AlipayTradeStatus;
}

/** 下单并拿到收款二维码内容；quantity 对会员是月数，对积分是份数 */
export function createAlipayOrder(steamId: string, productCode: AlipayProductCode, quantity: number) {
  return apiFetch<AlipayOrderCreated>('/api/alipay/order/create', {
    method: 'POST',
    body: JSON.stringify({ steamId: Number(steamId), productCode, quantity }),
  });
}

export function queryAlipayOrder(outTradeNo: string) {
  return apiFetch<AlipayOrderStatus>(
    `/api/alipay/order/query?outTradeNo=${encodeURIComponent(outTradeNo)}`,
  );
}
